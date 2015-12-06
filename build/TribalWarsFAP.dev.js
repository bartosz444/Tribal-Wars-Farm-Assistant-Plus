// ==UserScript==
// @name          TW Farm Assistant Plus
// @namespace     https://github.com/sindresorhus/cssprettifier-userscript
// @version       0.9
// @description   One click farm helper for Tribal Wars.
// @author        TheVTM
// @require       https://cdnjs.cloudflare.com/ajax/libs/lodash.js/3.10.1/lodash.js
// @match         *://*.tribalwars.com.br/game.php?*screen=am_farm*
// @grant         GM_getValue
// @grant         GM_setValue
// @grant         GM_addStyle
// @grant         none
// ==/UserScript==
(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function (global){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */
/* eslint-disable no-proto */

var base64 = require('base64-js')
var ieee754 = require('ieee754')
var isArray = require('is-array')

exports.Buffer = Buffer
exports.SlowBuffer = SlowBuffer
exports.INSPECT_MAX_BYTES = 50
Buffer.poolSize = 8192 // not used by this implementation

var rootParent = {}

/**
 * If `Buffer.TYPED_ARRAY_SUPPORT`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (most compatible, even IE6)
 *
 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
 * Opera 11.6+, iOS 4.2+.
 *
 * Due to various browser bugs, sometimes the Object implementation will be used even
 * when the browser supports typed arrays.
 *
 * Note:
 *
 *   - Firefox 4-29 lacks support for adding new properties to `Uint8Array` instances,
 *     See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438.
 *
 *   - Safari 5-7 lacks support for changing the `Object.prototype.constructor` property
 *     on objects.
 *
 *   - Chrome 9-10 is missing the `TypedArray.prototype.subarray` function.
 *
 *   - IE10 has a broken `TypedArray.prototype.subarray` function which returns arrays of
 *     incorrect length in some situations.

 * We detect these buggy browsers and set `Buffer.TYPED_ARRAY_SUPPORT` to `false` so they
 * get the Object implementation, which is slower but behaves correctly.
 */
Buffer.TYPED_ARRAY_SUPPORT = global.TYPED_ARRAY_SUPPORT !== undefined
  ? global.TYPED_ARRAY_SUPPORT
  : typedArraySupport()

function typedArraySupport () {
  function Bar () {}
  try {
    var arr = new Uint8Array(1)
    arr.foo = function () { return 42 }
    arr.constructor = Bar
    return arr.foo() === 42 && // typed array instances can be augmented
        arr.constructor === Bar && // constructor can be set
        typeof arr.subarray === 'function' && // chrome 9-10 lack `subarray`
        arr.subarray(1, 1).byteLength === 0 // ie10 has broken `subarray`
  } catch (e) {
    return false
  }
}

function kMaxLength () {
  return Buffer.TYPED_ARRAY_SUPPORT
    ? 0x7fffffff
    : 0x3fffffff
}

/**
 * Class: Buffer
 * =============
 *
 * The Buffer constructor returns instances of `Uint8Array` that are augmented
 * with function properties for all the node `Buffer` API functions. We use
 * `Uint8Array` so that square bracket notation works as expected -- it returns
 * a single octet.
 *
 * By augmenting the instances, we can avoid modifying the `Uint8Array`
 * prototype.
 */
function Buffer (arg) {
  if (!(this instanceof Buffer)) {
    // Avoid going through an ArgumentsAdaptorTrampoline in the common case.
    if (arguments.length > 1) return new Buffer(arg, arguments[1])
    return new Buffer(arg)
  }

  this.length = 0
  this.parent = undefined

  // Common case.
  if (typeof arg === 'number') {
    return fromNumber(this, arg)
  }

  // Slightly less common case.
  if (typeof arg === 'string') {
    return fromString(this, arg, arguments.length > 1 ? arguments[1] : 'utf8')
  }

  // Unusual.
  return fromObject(this, arg)
}

function fromNumber (that, length) {
  that = allocate(that, length < 0 ? 0 : checked(length) | 0)
  if (!Buffer.TYPED_ARRAY_SUPPORT) {
    for (var i = 0; i < length; i++) {
      that[i] = 0
    }
  }
  return that
}

function fromString (that, string, encoding) {
  if (typeof encoding !== 'string' || encoding === '') encoding = 'utf8'

  // Assumption: byteLength() return value is always < kMaxLength.
  var length = byteLength(string, encoding) | 0
  that = allocate(that, length)

  that.write(string, encoding)
  return that
}

function fromObject (that, object) {
  if (Buffer.isBuffer(object)) return fromBuffer(that, object)

  if (isArray(object)) return fromArray(that, object)

  if (object == null) {
    throw new TypeError('must start with number, buffer, array or string')
  }

  if (typeof ArrayBuffer !== 'undefined') {
    if (object.buffer instanceof ArrayBuffer) {
      return fromTypedArray(that, object)
    }
    if (object instanceof ArrayBuffer) {
      return fromArrayBuffer(that, object)
    }
  }

  if (object.length) return fromArrayLike(that, object)

  return fromJsonObject(that, object)
}

function fromBuffer (that, buffer) {
  var length = checked(buffer.length) | 0
  that = allocate(that, length)
  buffer.copy(that, 0, 0, length)
  return that
}

function fromArray (that, array) {
  var length = checked(array.length) | 0
  that = allocate(that, length)
  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

// Duplicate of fromArray() to keep fromArray() monomorphic.
function fromTypedArray (that, array) {
  var length = checked(array.length) | 0
  that = allocate(that, length)
  // Truncating the elements is probably not what people expect from typed
  // arrays with BYTES_PER_ELEMENT > 1 but it's compatible with the behavior
  // of the old Buffer constructor.
  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

function fromArrayBuffer (that, array) {
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    // Return an augmented `Uint8Array` instance, for best performance
    array.byteLength
    that = Buffer._augment(new Uint8Array(array))
  } else {
    // Fallback: Return an object instance of the Buffer class
    that = fromTypedArray(that, new Uint8Array(array))
  }
  return that
}

function fromArrayLike (that, array) {
  var length = checked(array.length) | 0
  that = allocate(that, length)
  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

// Deserialize { type: 'Buffer', data: [1,2,3,...] } into a Buffer object.
// Returns a zero-length buffer for inputs that don't conform to the spec.
function fromJsonObject (that, object) {
  var array
  var length = 0

  if (object.type === 'Buffer' && isArray(object.data)) {
    array = object.data
    length = checked(array.length) | 0
  }
  that = allocate(that, length)

  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

if (Buffer.TYPED_ARRAY_SUPPORT) {
  Buffer.prototype.__proto__ = Uint8Array.prototype
  Buffer.__proto__ = Uint8Array
}

function allocate (that, length) {
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    // Return an augmented `Uint8Array` instance, for best performance
    that = Buffer._augment(new Uint8Array(length))
    that.__proto__ = Buffer.prototype
  } else {
    // Fallback: Return an object instance of the Buffer class
    that.length = length
    that._isBuffer = true
  }

  var fromPool = length !== 0 && length <= Buffer.poolSize >>> 1
  if (fromPool) that.parent = rootParent

  return that
}

function checked (length) {
  // Note: cannot use `length < kMaxLength` here because that fails when
  // length is NaN (which is otherwise coerced to zero.)
  if (length >= kMaxLength()) {
    throw new RangeError('Attempt to allocate Buffer larger than maximum ' +
                         'size: 0x' + kMaxLength().toString(16) + ' bytes')
  }
  return length | 0
}

function SlowBuffer (subject, encoding) {
  if (!(this instanceof SlowBuffer)) return new SlowBuffer(subject, encoding)

  var buf = new Buffer(subject, encoding)
  delete buf.parent
  return buf
}

Buffer.isBuffer = function isBuffer (b) {
  return !!(b != null && b._isBuffer)
}

Buffer.compare = function compare (a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) {
    throw new TypeError('Arguments must be Buffers')
  }

  if (a === b) return 0

  var x = a.length
  var y = b.length

  var i = 0
  var len = Math.min(x, y)
  while (i < len) {
    if (a[i] !== b[i]) break

    ++i
  }

  if (i !== len) {
    x = a[i]
    y = b[i]
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

Buffer.isEncoding = function isEncoding (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'binary':
    case 'base64':
    case 'raw':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.concat = function concat (list, length) {
  if (!isArray(list)) throw new TypeError('list argument must be an Array of Buffers.')

  if (list.length === 0) {
    return new Buffer(0)
  }

  var i
  if (length === undefined) {
    length = 0
    for (i = 0; i < list.length; i++) {
      length += list[i].length
    }
  }

  var buf = new Buffer(length)
  var pos = 0
  for (i = 0; i < list.length; i++) {
    var item = list[i]
    item.copy(buf, pos)
    pos += item.length
  }
  return buf
}

function byteLength (string, encoding) {
  if (typeof string !== 'string') string = '' + string

  var len = string.length
  if (len === 0) return 0

  // Use a for loop to avoid recursion
  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'ascii':
      case 'binary':
      // Deprecated
      case 'raw':
      case 'raws':
        return len
      case 'utf8':
      case 'utf-8':
        return utf8ToBytes(string).length
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return len * 2
      case 'hex':
        return len >>> 1
      case 'base64':
        return base64ToBytes(string).length
      default:
        if (loweredCase) return utf8ToBytes(string).length // assume utf8
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}
Buffer.byteLength = byteLength

// pre-set for values that may exist in the future
Buffer.prototype.length = undefined
Buffer.prototype.parent = undefined

function slowToString (encoding, start, end) {
  var loweredCase = false

  start = start | 0
  end = end === undefined || end === Infinity ? this.length : end | 0

  if (!encoding) encoding = 'utf8'
  if (start < 0) start = 0
  if (end > this.length) end = this.length
  if (end <= start) return ''

  while (true) {
    switch (encoding) {
      case 'hex':
        return hexSlice(this, start, end)

      case 'utf8':
      case 'utf-8':
        return utf8Slice(this, start, end)

      case 'ascii':
        return asciiSlice(this, start, end)

      case 'binary':
        return binarySlice(this, start, end)

      case 'base64':
        return base64Slice(this, start, end)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return utf16leSlice(this, start, end)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = (encoding + '').toLowerCase()
        loweredCase = true
    }
  }
}

Buffer.prototype.toString = function toString () {
  var length = this.length | 0
  if (length === 0) return ''
  if (arguments.length === 0) return utf8Slice(this, 0, length)
  return slowToString.apply(this, arguments)
}

Buffer.prototype.equals = function equals (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return true
  return Buffer.compare(this, b) === 0
}

Buffer.prototype.inspect = function inspect () {
  var str = ''
  var max = exports.INSPECT_MAX_BYTES
  if (this.length > 0) {
    str = this.toString('hex', 0, max).match(/.{2}/g).join(' ')
    if (this.length > max) str += ' ... '
  }
  return '<Buffer ' + str + '>'
}

Buffer.prototype.compare = function compare (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return 0
  return Buffer.compare(this, b)
}

Buffer.prototype.indexOf = function indexOf (val, byteOffset) {
  if (byteOffset > 0x7fffffff) byteOffset = 0x7fffffff
  else if (byteOffset < -0x80000000) byteOffset = -0x80000000
  byteOffset >>= 0

  if (this.length === 0) return -1
  if (byteOffset >= this.length) return -1

  // Negative offsets start from the end of the buffer
  if (byteOffset < 0) byteOffset = Math.max(this.length + byteOffset, 0)

  if (typeof val === 'string') {
    if (val.length === 0) return -1 // special case: looking for empty string always fails
    return String.prototype.indexOf.call(this, val, byteOffset)
  }
  if (Buffer.isBuffer(val)) {
    return arrayIndexOf(this, val, byteOffset)
  }
  if (typeof val === 'number') {
    if (Buffer.TYPED_ARRAY_SUPPORT && Uint8Array.prototype.indexOf === 'function') {
      return Uint8Array.prototype.indexOf.call(this, val, byteOffset)
    }
    return arrayIndexOf(this, [ val ], byteOffset)
  }

  function arrayIndexOf (arr, val, byteOffset) {
    var foundIndex = -1
    for (var i = 0; byteOffset + i < arr.length; i++) {
      if (arr[byteOffset + i] === val[foundIndex === -1 ? 0 : i - foundIndex]) {
        if (foundIndex === -1) foundIndex = i
        if (i - foundIndex + 1 === val.length) return byteOffset + foundIndex
      } else {
        foundIndex = -1
      }
    }
    return -1
  }

  throw new TypeError('val must be string, number or Buffer')
}

// `get` is deprecated
Buffer.prototype.get = function get (offset) {
  console.log('.get() is deprecated. Access using array indexes instead.')
  return this.readUInt8(offset)
}

// `set` is deprecated
Buffer.prototype.set = function set (v, offset) {
  console.log('.set() is deprecated. Access using array indexes instead.')
  return this.writeUInt8(v, offset)
}

function hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  // must be an even number of digits
  var strLen = string.length
  if (strLen % 2 !== 0) throw new Error('Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; i++) {
    var parsed = parseInt(string.substr(i * 2, 2), 16)
    if (isNaN(parsed)) throw new Error('Invalid hex string')
    buf[offset + i] = parsed
  }
  return i
}

function utf8Write (buf, string, offset, length) {
  return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length)
}

function asciiWrite (buf, string, offset, length) {
  return blitBuffer(asciiToBytes(string), buf, offset, length)
}

function binaryWrite (buf, string, offset, length) {
  return asciiWrite(buf, string, offset, length)
}

function base64Write (buf, string, offset, length) {
  return blitBuffer(base64ToBytes(string), buf, offset, length)
}

function ucs2Write (buf, string, offset, length) {
  return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length)
}

Buffer.prototype.write = function write (string, offset, length, encoding) {
  // Buffer#write(string)
  if (offset === undefined) {
    encoding = 'utf8'
    length = this.length
    offset = 0
  // Buffer#write(string, encoding)
  } else if (length === undefined && typeof offset === 'string') {
    encoding = offset
    length = this.length
    offset = 0
  // Buffer#write(string, offset[, length][, encoding])
  } else if (isFinite(offset)) {
    offset = offset | 0
    if (isFinite(length)) {
      length = length | 0
      if (encoding === undefined) encoding = 'utf8'
    } else {
      encoding = length
      length = undefined
    }
  // legacy write(string, encoding, offset, length) - remove in v0.13
  } else {
    var swap = encoding
    encoding = offset
    offset = length | 0
    length = swap
  }

  var remaining = this.length - offset
  if (length === undefined || length > remaining) length = remaining

  if ((string.length > 0 && (length < 0 || offset < 0)) || offset > this.length) {
    throw new RangeError('attempt to write outside buffer bounds')
  }

  if (!encoding) encoding = 'utf8'

  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'hex':
        return hexWrite(this, string, offset, length)

      case 'utf8':
      case 'utf-8':
        return utf8Write(this, string, offset, length)

      case 'ascii':
        return asciiWrite(this, string, offset, length)

      case 'binary':
        return binaryWrite(this, string, offset, length)

      case 'base64':
        // Warning: maxLength not taken into account in base64Write
        return base64Write(this, string, offset, length)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return ucs2Write(this, string, offset, length)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}

Buffer.prototype.toJSON = function toJSON () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

function base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function utf8Slice (buf, start, end) {
  end = Math.min(buf.length, end)
  var res = []

  var i = start
  while (i < end) {
    var firstByte = buf[i]
    var codePoint = null
    var bytesPerSequence = (firstByte > 0xEF) ? 4
      : (firstByte > 0xDF) ? 3
      : (firstByte > 0xBF) ? 2
      : 1

    if (i + bytesPerSequence <= end) {
      var secondByte, thirdByte, fourthByte, tempCodePoint

      switch (bytesPerSequence) {
        case 1:
          if (firstByte < 0x80) {
            codePoint = firstByte
          }
          break
        case 2:
          secondByte = buf[i + 1]
          if ((secondByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0x1F) << 0x6 | (secondByte & 0x3F)
            if (tempCodePoint > 0x7F) {
              codePoint = tempCodePoint
            }
          }
          break
        case 3:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0xC | (secondByte & 0x3F) << 0x6 | (thirdByte & 0x3F)
            if (tempCodePoint > 0x7FF && (tempCodePoint < 0xD800 || tempCodePoint > 0xDFFF)) {
              codePoint = tempCodePoint
            }
          }
          break
        case 4:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          fourthByte = buf[i + 3]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80 && (fourthByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0x12 | (secondByte & 0x3F) << 0xC | (thirdByte & 0x3F) << 0x6 | (fourthByte & 0x3F)
            if (tempCodePoint > 0xFFFF && tempCodePoint < 0x110000) {
              codePoint = tempCodePoint
            }
          }
      }
    }

    if (codePoint === null) {
      // we did not generate a valid codePoint so insert a
      // replacement char (U+FFFD) and advance only 1 byte
      codePoint = 0xFFFD
      bytesPerSequence = 1
    } else if (codePoint > 0xFFFF) {
      // encode to utf16 (surrogate pair dance)
      codePoint -= 0x10000
      res.push(codePoint >>> 10 & 0x3FF | 0xD800)
      codePoint = 0xDC00 | codePoint & 0x3FF
    }

    res.push(codePoint)
    i += bytesPerSequence
  }

  return decodeCodePointsArray(res)
}

// Based on http://stackoverflow.com/a/22747272/680742, the browser with
// the lowest limit is Chrome, with 0x10000 args.
// We go 1 magnitude less, for safety
var MAX_ARGUMENTS_LENGTH = 0x1000

function decodeCodePointsArray (codePoints) {
  var len = codePoints.length
  if (len <= MAX_ARGUMENTS_LENGTH) {
    return String.fromCharCode.apply(String, codePoints) // avoid extra slice()
  }

  // Decode in chunks to avoid "call stack size exceeded".
  var res = ''
  var i = 0
  while (i < len) {
    res += String.fromCharCode.apply(
      String,
      codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH)
    )
  }
  return res
}

function asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    ret += String.fromCharCode(buf[i] & 0x7F)
  }
  return ret
}

function binarySlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    ret += String.fromCharCode(buf[i])
  }
  return ret
}

function hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; i++) {
    out += toHex(buf[i])
  }
  return out
}

function utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256)
  }
  return res
}

Buffer.prototype.slice = function slice (start, end) {
  var len = this.length
  start = ~~start
  end = end === undefined ? len : ~~end

  if (start < 0) {
    start += len
    if (start < 0) start = 0
  } else if (start > len) {
    start = len
  }

  if (end < 0) {
    end += len
    if (end < 0) end = 0
  } else if (end > len) {
    end = len
  }

  if (end < start) end = start

  var newBuf
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    newBuf = Buffer._augment(this.subarray(start, end))
  } else {
    var sliceLen = end - start
    newBuf = new Buffer(sliceLen, undefined)
    for (var i = 0; i < sliceLen; i++) {
      newBuf[i] = this[i + start]
    }
  }

  if (newBuf.length) newBuf.parent = this.parent || this

  return newBuf
}

/*
 * Need to make sure that buffer isn't trying to write out of bounds.
 */
function checkOffset (offset, ext, length) {
  if ((offset % 1) !== 0 || offset < 0) throw new RangeError('offset is not uint')
  if (offset + ext > length) throw new RangeError('Trying to access beyond buffer length')
}

Buffer.prototype.readUIntLE = function readUIntLE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }

  return val
}

Buffer.prototype.readUIntBE = function readUIntBE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) {
    checkOffset(offset, byteLength, this.length)
  }

  var val = this[offset + --byteLength]
  var mul = 1
  while (byteLength > 0 && (mul *= 0x100)) {
    val += this[offset + --byteLength] * mul
  }

  return val
}

Buffer.prototype.readUInt8 = function readUInt8 (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 1, this.length)
  return this[offset]
}

Buffer.prototype.readUInt16LE = function readUInt16LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  return this[offset] | (this[offset + 1] << 8)
}

Buffer.prototype.readUInt16BE = function readUInt16BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  return (this[offset] << 8) | this[offset + 1]
}

Buffer.prototype.readUInt32LE = function readUInt32LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return ((this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16)) +
      (this[offset + 3] * 0x1000000)
}

Buffer.prototype.readUInt32BE = function readUInt32BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] * 0x1000000) +
    ((this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    this[offset + 3])
}

Buffer.prototype.readIntLE = function readIntLE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readIntBE = function readIntBE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var i = byteLength
  var mul = 1
  var val = this[offset + --i]
  while (i > 0 && (mul *= 0x100)) {
    val += this[offset + --i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readInt8 = function readInt8 (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 1, this.length)
  if (!(this[offset] & 0x80)) return (this[offset])
  return ((0xff - this[offset] + 1) * -1)
}

Buffer.prototype.readInt16LE = function readInt16LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset] | (this[offset + 1] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt16BE = function readInt16BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset + 1] | (this[offset] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt32LE = function readInt32LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset]) |
    (this[offset + 1] << 8) |
    (this[offset + 2] << 16) |
    (this[offset + 3] << 24)
}

Buffer.prototype.readInt32BE = function readInt32BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] << 24) |
    (this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    (this[offset + 3])
}

Buffer.prototype.readFloatLE = function readFloatLE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, true, 23, 4)
}

Buffer.prototype.readFloatBE = function readFloatBE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, false, 23, 4)
}

Buffer.prototype.readDoubleLE = function readDoubleLE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, true, 52, 8)
}

Buffer.prototype.readDoubleBE = function readDoubleBE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, false, 52, 8)
}

function checkInt (buf, value, offset, ext, max, min) {
  if (!Buffer.isBuffer(buf)) throw new TypeError('buffer must be a Buffer instance')
  if (value > max || value < min) throw new RangeError('value is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('index out of range')
}

Buffer.prototype.writeUIntLE = function writeUIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkInt(this, value, offset, byteLength, Math.pow(2, 8 * byteLength), 0)

  var mul = 1
  var i = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUIntBE = function writeUIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkInt(this, value, offset, byteLength, Math.pow(2, 8 * byteLength), 0)

  var i = byteLength - 1
  var mul = 1
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUInt8 = function writeUInt8 (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 1, 0xff, 0)
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value)
  this[offset] = (value & 0xff)
  return offset + 1
}

function objectWriteUInt16 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffff + value + 1
  for (var i = 0, j = Math.min(buf.length - offset, 2); i < j; i++) {
    buf[offset + i] = (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
      (littleEndian ? i : 1 - i) * 8
  }
}

Buffer.prototype.writeUInt16LE = function writeUInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value & 0xff)
    this[offset + 1] = (value >>> 8)
  } else {
    objectWriteUInt16(this, value, offset, true)
  }
  return offset + 2
}

Buffer.prototype.writeUInt16BE = function writeUInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8)
    this[offset + 1] = (value & 0xff)
  } else {
    objectWriteUInt16(this, value, offset, false)
  }
  return offset + 2
}

function objectWriteUInt32 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffffffff + value + 1
  for (var i = 0, j = Math.min(buf.length - offset, 4); i < j; i++) {
    buf[offset + i] = (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff
  }
}

Buffer.prototype.writeUInt32LE = function writeUInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset + 3] = (value >>> 24)
    this[offset + 2] = (value >>> 16)
    this[offset + 1] = (value >>> 8)
    this[offset] = (value & 0xff)
  } else {
    objectWriteUInt32(this, value, offset, true)
  }
  return offset + 4
}

Buffer.prototype.writeUInt32BE = function writeUInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24)
    this[offset + 1] = (value >>> 16)
    this[offset + 2] = (value >>> 8)
    this[offset + 3] = (value & 0xff)
  } else {
    objectWriteUInt32(this, value, offset, false)
  }
  return offset + 4
}

Buffer.prototype.writeIntLE = function writeIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) {
    var limit = Math.pow(2, 8 * byteLength - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = 0
  var mul = 1
  var sub = value < 0 ? 1 : 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeIntBE = function writeIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) {
    var limit = Math.pow(2, 8 * byteLength - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = byteLength - 1
  var mul = 1
  var sub = value < 0 ? 1 : 0
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeInt8 = function writeInt8 (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 1, 0x7f, -0x80)
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value)
  if (value < 0) value = 0xff + value + 1
  this[offset] = (value & 0xff)
  return offset + 1
}

Buffer.prototype.writeInt16LE = function writeInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value & 0xff)
    this[offset + 1] = (value >>> 8)
  } else {
    objectWriteUInt16(this, value, offset, true)
  }
  return offset + 2
}

Buffer.prototype.writeInt16BE = function writeInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8)
    this[offset + 1] = (value & 0xff)
  } else {
    objectWriteUInt16(this, value, offset, false)
  }
  return offset + 2
}

Buffer.prototype.writeInt32LE = function writeInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value & 0xff)
    this[offset + 1] = (value >>> 8)
    this[offset + 2] = (value >>> 16)
    this[offset + 3] = (value >>> 24)
  } else {
    objectWriteUInt32(this, value, offset, true)
  }
  return offset + 4
}

Buffer.prototype.writeInt32BE = function writeInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (value < 0) value = 0xffffffff + value + 1
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24)
    this[offset + 1] = (value >>> 16)
    this[offset + 2] = (value >>> 8)
    this[offset + 3] = (value & 0xff)
  } else {
    objectWriteUInt32(this, value, offset, false)
  }
  return offset + 4
}

function checkIEEE754 (buf, value, offset, ext, max, min) {
  if (value > max || value < min) throw new RangeError('value is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('index out of range')
  if (offset < 0) throw new RangeError('index out of range')
}

function writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 4, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }
  ieee754.write(buf, value, offset, littleEndian, 23, 4)
  return offset + 4
}

Buffer.prototype.writeFloatLE = function writeFloatLE (value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function writeFloatBE (value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert)
}

function writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 8, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }
  ieee754.write(buf, value, offset, littleEndian, 52, 8)
  return offset + 8
}

Buffer.prototype.writeDoubleLE = function writeDoubleLE (value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function writeDoubleBE (value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert)
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function copy (target, targetStart, start, end) {
  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (targetStart >= target.length) targetStart = target.length
  if (!targetStart) targetStart = 0
  if (end > 0 && end < start) end = start

  // Copy 0 bytes; we're done
  if (end === start) return 0
  if (target.length === 0 || this.length === 0) return 0

  // Fatal error conditions
  if (targetStart < 0) {
    throw new RangeError('targetStart out of bounds')
  }
  if (start < 0 || start >= this.length) throw new RangeError('sourceStart out of bounds')
  if (end < 0) throw new RangeError('sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length) end = this.length
  if (target.length - targetStart < end - start) {
    end = target.length - targetStart + start
  }

  var len = end - start
  var i

  if (this === target && start < targetStart && targetStart < end) {
    // descending copy from end
    for (i = len - 1; i >= 0; i--) {
      target[i + targetStart] = this[i + start]
    }
  } else if (len < 1000 || !Buffer.TYPED_ARRAY_SUPPORT) {
    // ascending copy from start
    for (i = 0; i < len; i++) {
      target[i + targetStart] = this[i + start]
    }
  } else {
    target._set(this.subarray(start, start + len), targetStart)
  }

  return len
}

// fill(value, start=0, end=buffer.length)
Buffer.prototype.fill = function fill (value, start, end) {
  if (!value) value = 0
  if (!start) start = 0
  if (!end) end = this.length

  if (end < start) throw new RangeError('end < start')

  // Fill 0 bytes; we're done
  if (end === start) return
  if (this.length === 0) return

  if (start < 0 || start >= this.length) throw new RangeError('start out of bounds')
  if (end < 0 || end > this.length) throw new RangeError('end out of bounds')

  var i
  if (typeof value === 'number') {
    for (i = start; i < end; i++) {
      this[i] = value
    }
  } else {
    var bytes = utf8ToBytes(value.toString())
    var len = bytes.length
    for (i = start; i < end; i++) {
      this[i] = bytes[i % len]
    }
  }

  return this
}

/**
 * Creates a new `ArrayBuffer` with the *copied* memory of the buffer instance.
 * Added in Node 0.12. Only available in browsers that support ArrayBuffer.
 */
Buffer.prototype.toArrayBuffer = function toArrayBuffer () {
  if (typeof Uint8Array !== 'undefined') {
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      return (new Buffer(this)).buffer
    } else {
      var buf = new Uint8Array(this.length)
      for (var i = 0, len = buf.length; i < len; i += 1) {
        buf[i] = this[i]
      }
      return buf.buffer
    }
  } else {
    throw new TypeError('Buffer.toArrayBuffer not supported in this browser')
  }
}

// HELPER FUNCTIONS
// ================

var BP = Buffer.prototype

/**
 * Augment a Uint8Array *instance* (not the Uint8Array class!) with Buffer methods
 */
Buffer._augment = function _augment (arr) {
  arr.constructor = Buffer
  arr._isBuffer = true

  // save reference to original Uint8Array set method before overwriting
  arr._set = arr.set

  // deprecated
  arr.get = BP.get
  arr.set = BP.set

  arr.write = BP.write
  arr.toString = BP.toString
  arr.toLocaleString = BP.toString
  arr.toJSON = BP.toJSON
  arr.equals = BP.equals
  arr.compare = BP.compare
  arr.indexOf = BP.indexOf
  arr.copy = BP.copy
  arr.slice = BP.slice
  arr.readUIntLE = BP.readUIntLE
  arr.readUIntBE = BP.readUIntBE
  arr.readUInt8 = BP.readUInt8
  arr.readUInt16LE = BP.readUInt16LE
  arr.readUInt16BE = BP.readUInt16BE
  arr.readUInt32LE = BP.readUInt32LE
  arr.readUInt32BE = BP.readUInt32BE
  arr.readIntLE = BP.readIntLE
  arr.readIntBE = BP.readIntBE
  arr.readInt8 = BP.readInt8
  arr.readInt16LE = BP.readInt16LE
  arr.readInt16BE = BP.readInt16BE
  arr.readInt32LE = BP.readInt32LE
  arr.readInt32BE = BP.readInt32BE
  arr.readFloatLE = BP.readFloatLE
  arr.readFloatBE = BP.readFloatBE
  arr.readDoubleLE = BP.readDoubleLE
  arr.readDoubleBE = BP.readDoubleBE
  arr.writeUInt8 = BP.writeUInt8
  arr.writeUIntLE = BP.writeUIntLE
  arr.writeUIntBE = BP.writeUIntBE
  arr.writeUInt16LE = BP.writeUInt16LE
  arr.writeUInt16BE = BP.writeUInt16BE
  arr.writeUInt32LE = BP.writeUInt32LE
  arr.writeUInt32BE = BP.writeUInt32BE
  arr.writeIntLE = BP.writeIntLE
  arr.writeIntBE = BP.writeIntBE
  arr.writeInt8 = BP.writeInt8
  arr.writeInt16LE = BP.writeInt16LE
  arr.writeInt16BE = BP.writeInt16BE
  arr.writeInt32LE = BP.writeInt32LE
  arr.writeInt32BE = BP.writeInt32BE
  arr.writeFloatLE = BP.writeFloatLE
  arr.writeFloatBE = BP.writeFloatBE
  arr.writeDoubleLE = BP.writeDoubleLE
  arr.writeDoubleBE = BP.writeDoubleBE
  arr.fill = BP.fill
  arr.inspect = BP.inspect
  arr.toArrayBuffer = BP.toArrayBuffer

  return arr
}

var INVALID_BASE64_RE = /[^+\/0-9A-Za-z-_]/g

function base64clean (str) {
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
  str = stringtrim(str).replace(INVALID_BASE64_RE, '')
  // Node converts strings with length < 2 to ''
  if (str.length < 2) return ''
  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
  while (str.length % 4 !== 0) {
    str = str + '='
  }
  return str
}

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (string, units) {
  units = units || Infinity
  var codePoint
  var length = string.length
  var leadSurrogate = null
  var bytes = []

  for (var i = 0; i < length; i++) {
    codePoint = string.charCodeAt(i)

    // is surrogate component
    if (codePoint > 0xD7FF && codePoint < 0xE000) {
      // last char was a lead
      if (!leadSurrogate) {
        // no lead yet
        if (codePoint > 0xDBFF) {
          // unexpected trail
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        } else if (i + 1 === length) {
          // unpaired lead
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        }

        // valid lead
        leadSurrogate = codePoint

        continue
      }

      // 2 leads in a row
      if (codePoint < 0xDC00) {
        if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
        leadSurrogate = codePoint
        continue
      }

      // valid surrogate pair
      codePoint = (leadSurrogate - 0xD800 << 10 | codePoint - 0xDC00) + 0x10000
    } else if (leadSurrogate) {
      // valid bmp char, but last char was a lead
      if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
    }

    leadSurrogate = null

    // encode utf8
    if (codePoint < 0x80) {
      if ((units -= 1) < 0) break
      bytes.push(codePoint)
    } else if (codePoint < 0x800) {
      if ((units -= 2) < 0) break
      bytes.push(
        codePoint >> 0x6 | 0xC0,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x10000) {
      if ((units -= 3) < 0) break
      bytes.push(
        codePoint >> 0xC | 0xE0,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x110000) {
      if ((units -= 4) < 0) break
      bytes.push(
        codePoint >> 0x12 | 0xF0,
        codePoint >> 0xC & 0x3F | 0x80,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else {
      throw new Error('Invalid code point')
    }
  }

  return bytes
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str, units) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    if ((units -= 2) < 0) break

    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(base64clean(str))
}

function blitBuffer (src, dst, offset, length) {
  for (var i = 0; i < length; i++) {
    if ((i + offset >= dst.length) || (i >= src.length)) break
    dst[i + offset] = src[i]
  }
  return i
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"base64-js":2,"ieee754":3,"is-array":4}],2:[function(require,module,exports){
var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

;(function (exports) {
	'use strict';

  var Arr = (typeof Uint8Array !== 'undefined')
    ? Uint8Array
    : Array

	var PLUS   = '+'.charCodeAt(0)
	var SLASH  = '/'.charCodeAt(0)
	var NUMBER = '0'.charCodeAt(0)
	var LOWER  = 'a'.charCodeAt(0)
	var UPPER  = 'A'.charCodeAt(0)
	var PLUS_URL_SAFE = '-'.charCodeAt(0)
	var SLASH_URL_SAFE = '_'.charCodeAt(0)

	function decode (elt) {
		var code = elt.charCodeAt(0)
		if (code === PLUS ||
		    code === PLUS_URL_SAFE)
			return 62 // '+'
		if (code === SLASH ||
		    code === SLASH_URL_SAFE)
			return 63 // '/'
		if (code < NUMBER)
			return -1 //no match
		if (code < NUMBER + 10)
			return code - NUMBER + 26 + 26
		if (code < UPPER + 26)
			return code - UPPER
		if (code < LOWER + 26)
			return code - LOWER + 26
	}

	function b64ToByteArray (b64) {
		var i, j, l, tmp, placeHolders, arr

		if (b64.length % 4 > 0) {
			throw new Error('Invalid string. Length must be a multiple of 4')
		}

		// the number of equal signs (place holders)
		// if there are two placeholders, than the two characters before it
		// represent one byte
		// if there is only one, then the three characters before it represent 2 bytes
		// this is just a cheap hack to not do indexOf twice
		var len = b64.length
		placeHolders = '=' === b64.charAt(len - 2) ? 2 : '=' === b64.charAt(len - 1) ? 1 : 0

		// base64 is 4/3 + up to two characters of the original data
		arr = new Arr(b64.length * 3 / 4 - placeHolders)

		// if there are placeholders, only get up to the last complete 4 chars
		l = placeHolders > 0 ? b64.length - 4 : b64.length

		var L = 0

		function push (v) {
			arr[L++] = v
		}

		for (i = 0, j = 0; i < l; i += 4, j += 3) {
			tmp = (decode(b64.charAt(i)) << 18) | (decode(b64.charAt(i + 1)) << 12) | (decode(b64.charAt(i + 2)) << 6) | decode(b64.charAt(i + 3))
			push((tmp & 0xFF0000) >> 16)
			push((tmp & 0xFF00) >> 8)
			push(tmp & 0xFF)
		}

		if (placeHolders === 2) {
			tmp = (decode(b64.charAt(i)) << 2) | (decode(b64.charAt(i + 1)) >> 4)
			push(tmp & 0xFF)
		} else if (placeHolders === 1) {
			tmp = (decode(b64.charAt(i)) << 10) | (decode(b64.charAt(i + 1)) << 4) | (decode(b64.charAt(i + 2)) >> 2)
			push((tmp >> 8) & 0xFF)
			push(tmp & 0xFF)
		}

		return arr
	}

	function uint8ToBase64 (uint8) {
		var i,
			extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
			output = "",
			temp, length

		function encode (num) {
			return lookup.charAt(num)
		}

		function tripletToBase64 (num) {
			return encode(num >> 18 & 0x3F) + encode(num >> 12 & 0x3F) + encode(num >> 6 & 0x3F) + encode(num & 0x3F)
		}

		// go through the array every three bytes, we'll deal with trailing stuff later
		for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
			temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2])
			output += tripletToBase64(temp)
		}

		// pad the end with zeros, but make sure to not forget the extra bytes
		switch (extraBytes) {
			case 1:
				temp = uint8[uint8.length - 1]
				output += encode(temp >> 2)
				output += encode((temp << 4) & 0x3F)
				output += '=='
				break
			case 2:
				temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1])
				output += encode(temp >> 10)
				output += encode((temp >> 4) & 0x3F)
				output += encode((temp << 2) & 0x3F)
				output += '='
				break
		}

		return output
	}

	exports.toByteArray = b64ToByteArray
	exports.fromByteArray = uint8ToBase64
}(typeof exports === 'undefined' ? (this.base64js = {}) : exports))

},{}],3:[function(require,module,exports){
exports.read = function (buffer, offset, isLE, mLen, nBytes) {
  var e, m
  var eLen = nBytes * 8 - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var nBits = -7
  var i = isLE ? (nBytes - 1) : 0
  var d = isLE ? -1 : 1
  var s = buffer[offset + i]

  i += d

  e = s & ((1 << (-nBits)) - 1)
  s >>= (-nBits)
  nBits += eLen
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  m = e & ((1 << (-nBits)) - 1)
  e >>= (-nBits)
  nBits += mLen
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  if (e === 0) {
    e = 1 - eBias
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity)
  } else {
    m = m + Math.pow(2, mLen)
    e = e - eBias
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
}

exports.write = function (buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c
  var eLen = nBytes * 8 - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0)
  var i = isLE ? 0 : (nBytes - 1)
  var d = isLE ? 1 : -1
  var s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0

  value = Math.abs(value)

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0
    e = eMax
  } else {
    e = Math.floor(Math.log(value) / Math.LN2)
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--
      c *= 2
    }
    if (e + eBias >= 1) {
      value += rt / c
    } else {
      value += rt * Math.pow(2, 1 - eBias)
    }
    if (value * c >= 2) {
      e++
      c /= 2
    }

    if (e + eBias >= eMax) {
      m = 0
      e = eMax
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen)
      e = e + eBias
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen)
      e = 0
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

  e = (e << mLen) | m
  eLen += mLen
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

  buffer[offset + i - d] |= s * 128
}

},{}],4:[function(require,module,exports){

/**
 * isArray
 */

var isArray = Array.isArray;

/**
 * toString
 */

var str = Object.prototype.toString;

/**
 * Whether or not the given `val`
 * is an array.
 *
 * example:
 *
 *        isArray([]);
 *        // > true
 *        isArray(arguments);
 *        // > false
 *        isArray('');
 *        // > false
 *
 * @param {mixed} val
 * @return {bool}
 */

module.exports = isArray || function (val) {
  return !! val && '[object Array]' == str.call(val);
};

},{}],5:[function(require,module,exports){
/*

  Javascript State Machine Library - https://github.com/jakesgordon/javascript-state-machine

  Copyright (c) 2012, 2013, 2014, 2015, Jake Gordon and contributors
  Released under the MIT license - https://github.com/jakesgordon/javascript-state-machine/blob/master/LICENSE

*/

(function () {

  var StateMachine = {

    //---------------------------------------------------------------------------

    VERSION: "2.3.5",

    //---------------------------------------------------------------------------

    Result: {
      SUCCEEDED:    1, // the event transitioned successfully from one state to another
      NOTRANSITION: 2, // the event was successfull but no state transition was necessary
      CANCELLED:    3, // the event was cancelled by the caller in a beforeEvent callback
      PENDING:      4  // the event is asynchronous and the caller is in control of when the transition occurs
    },

    Error: {
      INVALID_TRANSITION: 100, // caller tried to fire an event that was innapropriate in the current state
      PENDING_TRANSITION: 200, // caller tried to fire an event while an async transition was still pending
      INVALID_CALLBACK:   300 // caller provided callback function threw an exception
    },

    WILDCARD: '*',
    ASYNC: 'async',

    //---------------------------------------------------------------------------

    create: function(cfg, target) {

      var initial      = (typeof cfg.initial == 'string') ? { state: cfg.initial } : cfg.initial; // allow for a simple string, or an object with { state: 'foo', event: 'setup', defer: true|false }
      var terminal     = cfg.terminal || cfg['final'];
      var fsm          = target || cfg.target  || {};
      var events       = cfg.events || [];
      var callbacks    = cfg.callbacks || {};
      var map          = {}; // track state transitions allowed for an event { event: { from: [ to ] } }
      var transitions  = {}; // track events allowed from a state            { state: [ event ] }

      var add = function(e) {
        var from = (e.from instanceof Array) ? e.from : (e.from ? [e.from] : [StateMachine.WILDCARD]); // allow 'wildcard' transition if 'from' is not specified
        map[e.name] = map[e.name] || {};
        for (var n = 0 ; n < from.length ; n++) {
          transitions[from[n]] = transitions[from[n]] || [];
          transitions[from[n]].push(e.name);

          map[e.name][from[n]] = e.to || from[n]; // allow no-op transition if 'to' is not specified
        }
      };

      if (initial) {
        initial.event = initial.event || 'startup';
        add({ name: initial.event, from: 'none', to: initial.state });
      }

      for(var n = 0 ; n < events.length ; n++)
        add(events[n]);

      for(var name in map) {
        if (map.hasOwnProperty(name))
          fsm[name] = StateMachine.buildEvent(name, map[name]);
      }

      for(var name in callbacks) {
        if (callbacks.hasOwnProperty(name))
          fsm[name] = callbacks[name]
      }

      fsm.current     = 'none';
      fsm.is          = function(state) { return (state instanceof Array) ? (state.indexOf(this.current) >= 0) : (this.current === state); };
      fsm.can         = function(event) { return !this.transition && (map[event].hasOwnProperty(this.current) || map[event].hasOwnProperty(StateMachine.WILDCARD)); }
      fsm.cannot      = function(event) { return !this.can(event); };
      fsm.transitions = function()      { return transitions[this.current]; };
      fsm.isFinished  = function()      { return this.is(terminal); };
      fsm.error       = cfg.error || function(name, from, to, args, error, msg, e) { throw e || msg; }; // default behavior when something unexpected happens is to throw an exception, but caller can override this behavior if desired (see github issue #3 and #17)

      if (initial && !initial.defer)
        fsm[initial.event]();

      return fsm;

    },

    //===========================================================================

    doCallback: function(fsm, func, name, from, to, args) {
      if (func) {
        try {
          return func.apply(fsm, [name, from, to].concat(args));
        }
        catch(e) {
          return fsm.error(name, from, to, args, StateMachine.Error.INVALID_CALLBACK, "an exception occurred in a caller-provided callback function", e);
        }
      }
    },

    beforeAnyEvent:  function(fsm, name, from, to, args) { return StateMachine.doCallback(fsm, fsm['onbeforeevent'],                       name, from, to, args); },
    afterAnyEvent:   function(fsm, name, from, to, args) { return StateMachine.doCallback(fsm, fsm['onafterevent'] || fsm['onevent'],      name, from, to, args); },
    leaveAnyState:   function(fsm, name, from, to, args) { return StateMachine.doCallback(fsm, fsm['onleavestate'],                        name, from, to, args); },
    enterAnyState:   function(fsm, name, from, to, args) { return StateMachine.doCallback(fsm, fsm['onenterstate'] || fsm['onstate'],      name, from, to, args); },
    changeState:     function(fsm, name, from, to, args) { return StateMachine.doCallback(fsm, fsm['onchangestate'],                       name, from, to, args); },

    beforeThisEvent: function(fsm, name, from, to, args) { return StateMachine.doCallback(fsm, fsm['onbefore' + name],                     name, from, to, args); },
    afterThisEvent:  function(fsm, name, from, to, args) { return StateMachine.doCallback(fsm, fsm['onafter'  + name] || fsm['on' + name], name, from, to, args); },
    leaveThisState:  function(fsm, name, from, to, args) { return StateMachine.doCallback(fsm, fsm['onleave'  + from],                     name, from, to, args); },
    enterThisState:  function(fsm, name, from, to, args) { return StateMachine.doCallback(fsm, fsm['onenter'  + to]   || fsm['on' + to],   name, from, to, args); },

    beforeEvent: function(fsm, name, from, to, args) {
      if ((false === StateMachine.beforeThisEvent(fsm, name, from, to, args)) ||
          (false === StateMachine.beforeAnyEvent( fsm, name, from, to, args)))
        return false;
    },

    afterEvent: function(fsm, name, from, to, args) {
      StateMachine.afterThisEvent(fsm, name, from, to, args);
      StateMachine.afterAnyEvent( fsm, name, from, to, args);
    },

    leaveState: function(fsm, name, from, to, args) {
      var specific = StateMachine.leaveThisState(fsm, name, from, to, args),
          general  = StateMachine.leaveAnyState( fsm, name, from, to, args);
      if ((false === specific) || (false === general))
        return false;
      else if ((StateMachine.ASYNC === specific) || (StateMachine.ASYNC === general))
        return StateMachine.ASYNC;
    },

    enterState: function(fsm, name, from, to, args) {
      StateMachine.enterThisState(fsm, name, from, to, args);
      StateMachine.enterAnyState( fsm, name, from, to, args);
    },

    //===========================================================================

    buildEvent: function(name, map) {
      return function() {

        var from  = this.current;
        var to    = map[from] || map[StateMachine.WILDCARD] || from;
        var args  = Array.prototype.slice.call(arguments); // turn arguments into pure array

        if (this.transition)
          return this.error(name, from, to, args, StateMachine.Error.PENDING_TRANSITION, "event " + name + " inappropriate because previous transition did not complete");

        if (this.cannot(name))
          return this.error(name, from, to, args, StateMachine.Error.INVALID_TRANSITION, "event " + name + " inappropriate in current state " + this.current);

        if (false === StateMachine.beforeEvent(this, name, from, to, args))
          return StateMachine.Result.CANCELLED;

        if (from === to) {
          StateMachine.afterEvent(this, name, from, to, args);
          return StateMachine.Result.NOTRANSITION;
        }

        // prepare a transition method for use EITHER lower down, or by caller if they want an async transition (indicated by an ASYNC return value from leaveState)
        var fsm = this;
        this.transition = function() {
          fsm.transition = null; // this method should only ever be called once
          fsm.current = to;
          StateMachine.enterState( fsm, name, from, to, args);
          StateMachine.changeState(fsm, name, from, to, args);
          StateMachine.afterEvent( fsm, name, from, to, args);
          return StateMachine.Result.SUCCEEDED;
        };
        this.transition.cancel = function() { // provide a way for caller to cancel async transition if desired (issue #22)
          fsm.transition = null;
          StateMachine.afterEvent(fsm, name, from, to, args);
        }

        var leave = StateMachine.leaveState(this, name, from, to, args);
        if (false === leave) {
          this.transition = null;
          return StateMachine.Result.CANCELLED;
        }
        else if (StateMachine.ASYNC === leave) {
          return StateMachine.Result.PENDING;
        }
        else {
          if (this.transition) // need to check in case user manually called transition() but forgot to return StateMachine.ASYNC
            return this.transition();
        }

      };
    }

  }; // StateMachine

  //===========================================================================

  //======
  // NODE
  //======
  if (typeof exports !== 'undefined') {
    if (typeof module !== 'undefined' && module.exports) {
      exports = module.exports = StateMachine;
    }
    exports.StateMachine = StateMachine;
  }
  //============
  // AMD/REQUIRE
  //============
  else if (typeof define === 'function' && define.amd) {
    define(function(require) { return StateMachine; });
  }
  //========
  // BROWSER
  //========
  else if (typeof window !== 'undefined') {
    window.StateMachine = StateMachine;
  }
  //===========
  // WEB WORKER
  //===========
  else if (typeof self !== 'undefined') {
    self.StateMachine = StateMachine;
  }

}());

},{}],6:[function(require,module,exports){
/*
* loglevel - https://github.com/pimterry/loglevel
*
* Copyright (c) 2013 Tim Perry
* Licensed under the MIT license.
*/
(function (root, definition) {
    "use strict";
    if (typeof module === 'object' && module.exports && typeof require === 'function') {
        module.exports = definition();
    } else if (typeof define === 'function' && typeof define.amd === 'object') {
        define(definition);
    } else {
        root.log = definition();
    }
}(this, function () {
    "use strict";
    var noop = function() {};
    var undefinedType = "undefined";

    function realMethod(methodName) {
        if (typeof console === undefinedType) {
            return false; // We can't build a real method without a console to log to
        } else if (console[methodName] !== undefined) {
            return bindMethod(console, methodName);
        } else if (console.log !== undefined) {
            return bindMethod(console, 'log');
        } else {
            return noop;
        }
    }

    function bindMethod(obj, methodName) {
        var method = obj[methodName];
        if (typeof method.bind === 'function') {
            return method.bind(obj);
        } else {
            try {
                return Function.prototype.bind.call(method, obj);
            } catch (e) {
                // Missing bind shim or IE8 + Modernizr, fallback to wrapping
                return function() {
                    return Function.prototype.apply.apply(method, [obj, arguments]);
                };
            }
        }
    }

    // these private functions always need `this` to be set properly

    function enableLoggingWhenConsoleArrives(methodName, level, loggerName) {
        return function () {
            if (typeof console !== undefinedType) {
                replaceLoggingMethods.call(this, level, loggerName);
                this[methodName].apply(this, arguments);
            }
        };
    }

    function replaceLoggingMethods(level, loggerName) {
        /*jshint validthis:true */
        for (var i = 0; i < logMethods.length; i++) {
            var methodName = logMethods[i];
            this[methodName] = (i < level) ?
                noop :
                this.methodFactory(methodName, level, loggerName);
        }
    }

    function defaultMethodFactory(methodName, level, loggerName) {
        /*jshint validthis:true */
        return realMethod(methodName) ||
               enableLoggingWhenConsoleArrives.apply(this, arguments);
    }

    var logMethods = [
        "trace",
        "debug",
        "info",
        "warn",
        "error"
    ];

    function Logger(name, defaultLevel, factory) {
      var self = this;
      var currentLevel;
      var storageKey = "loglevel";
      if (name) {
        storageKey += ":" + name;
      }

      function persistLevelIfPossible(levelNum) {
          var levelName = (logMethods[levelNum] || 'silent').toUpperCase();

          // Use localStorage if available
          try {
              window.localStorage[storageKey] = levelName;
              return;
          } catch (ignore) {}

          // Use session cookie as fallback
          try {
              window.document.cookie =
                encodeURIComponent(storageKey) + "=" + levelName + ";";
          } catch (ignore) {}
      }

      function getPersistedLevel() {
          var storedLevel;

          try {
              storedLevel = window.localStorage[storageKey];
          } catch (ignore) {}

          if (typeof storedLevel === undefinedType) {
              try {
                  var cookie = window.document.cookie;
                  var location = cookie.indexOf(
                      encodeURIComponent(storageKey) + "=");
                  if (location) {
                      storedLevel = /^([^;]+)/.exec(cookie.slice(location))[1];
                  }
              } catch (ignore) {}
          }

          // If the stored level is not valid, treat it as if nothing was stored.
          if (self.levels[storedLevel] === undefined) {
              storedLevel = undefined;
          }

          return storedLevel;
      }

      /*
       *
       * Public API
       *
       */

      self.levels = { "TRACE": 0, "DEBUG": 1, "INFO": 2, "WARN": 3,
          "ERROR": 4, "SILENT": 5};

      self.methodFactory = factory || defaultMethodFactory;

      self.getLevel = function () {
          return currentLevel;
      };

      self.setLevel = function (level, persist) {
          if (typeof level === "string" && self.levels[level.toUpperCase()] !== undefined) {
              level = self.levels[level.toUpperCase()];
          }
          if (typeof level === "number" && level >= 0 && level <= self.levels.SILENT) {
              currentLevel = level;
              if (persist !== false) {  // defaults to true
                  persistLevelIfPossible(level);
              }
              replaceLoggingMethods.call(self, level, name);
              if (typeof console === undefinedType && level < self.levels.SILENT) {
                  return "No console available for logging";
              }
          } else {
              throw "log.setLevel() called with invalid level: " + level;
          }
      };

      self.setDefaultLevel = function (level) {
          if (!getPersistedLevel()) {
              self.setLevel(level, false);
          }
      };

      self.enableAll = function(persist) {
          self.setLevel(self.levels.TRACE, persist);
      };

      self.disableAll = function(persist) {
          self.setLevel(self.levels.SILENT, persist);
      };

      // Initialize with the right level
      var initialLevel = getPersistedLevel();
      if (initialLevel == null) {
          initialLevel = defaultLevel == null ? "WARN" : defaultLevel;
      }
      self.setLevel(initialLevel, false);
    }

    /*
     *
     * Package-level API
     *
     */

    var defaultLogger = new Logger();

    var _loggersByName = {};
    defaultLogger.getLogger = function getLogger(name) {
        if (typeof name !== "string" || name === "") {
          throw new TypeError("You must supply a name when creating a logger.");
        }

        var logger = _loggersByName[name];
        if (!logger) {
          logger = _loggersByName[name] = new Logger(
            name, defaultLogger.getLevel(), defaultLogger.methodFactory);
        }
        return logger;
    };

    // Grab the current global log variable in case of overwrite
    var _log = (typeof window !== undefinedType) ? window.log : undefined;
    defaultLogger.noConflict = function() {
        if (typeof window !== undefinedType &&
               window.log === defaultLogger) {
            window.log = _log;
        }

        return defaultLogger;
    };

    return defaultLogger;
}));

},{}],7:[function(require,module,exports){
(function (global){
"use strict";

var $ = typeof window !== "undefined" ? window['$'] : typeof global !== "undefined" ? global['$'] : null;
var _ = typeof window !== "undefined" ? window['_'] : typeof global !== "undefined" ? global['_'] : null;

var constants = require('./const.js');
var PlunderableVillage = require("./data/plunderable-village");
var BotOrder = require("./data/bot-order.js");
var miner = require("./miner");
var util = require("./util");
var settings = require("./settings");

function hasEnougthUnits(units) {
  "use strict;";

  var current_units = miner.mineCurrentUnits();

  for (var unit_name in units) {
    if (current_units[unit_name] < units[unit_name]) {
      return false;
    }
  }

  return true;
}

exports.createOrders = function (plunderable_villages) {
  "use strict;";

  var orders = [];
  var bot_settings = settings.BotSettings;

  for (var i = 0; i < plunderable_villages.length; i++) {
    var pv = plunderable_villages[i];

    if (!pv.is_attacking) {
      /* Not already attacking */

      if (pv.wall > 0) {
        /* Has Wall */
        // Send a high priority attack with 10 ligth cav, 1 spy, and n rams
        var units = _.clone(bot_settings.RAM_UNITS);
        units.ram = bot_settings.RAMS_PER_WALL_LEVEL[pv.wall];
        orders.push(new BotOrder.CustomOrder(pv, units, -100));
      } else if (pv.getTotalRes() >= bot_settings.MIN_RES) {
        /* Doesn't have walls && Has resources */

        if (pv.distance <= bot_settings.MAX_DIST) {
          if (pv.getTotalRes() >= bot_settings.MAX_RES) {
            orders.push(new BotOrder.TemplateOrder(pv, bot_settings.MAX_TEMPLATE, 0));
          } else {
            orders.push(new BotOrder.TemplateOrder(pv, "C", 0));
          }
        }
      }
    }
  }

  return orders;
};

function runFnsEveryInterval(orders, ms) {
  "use strict";

  var ORDERS_EXECUTION_MIN_INTERVAL = 250;
  var ORDERS_EXECUTION_MAX_INTERVAL = 60000;

  ms = Math.min(Math.max(ms, ORDERS_EXECUTION_MIN_INTERVAL), ORDERS_EXECUTION_MAX_INTERVAL);

  var orders_fns = _.map(orders, function (o) {
    return _.bind(o.execute, o);
  });
  util.maybeRunFns(orders_fns, 1, ms);
}

function delay(interval) {
  return new Promise(function (resolve) {
    setTimeout(resolve, interval);
  });
}

exports.execute = function () {
  "use strict";

  // Gather villages info
  var plunderable_villages = miner.minePlunderVillages();

  // Create orders
  var orders = exports.createOrders(plunderable_villages);
  orders = _.sortByAll(orders, 'priority'); // Sort by higher priority

  /* Execute orders */
  var progress_bar = $("#TWFAP-progress-execution");
  var execute_promise = Promise.resolve();

  // Clear progressbar
  progress_bar.attr("max", orders.length);
  progress_bar.val(0);

  // Create promise

  var _loop = function (i) {
    var order = orders[i];

    execute_promise = execute_promise.then(function () {
      progress_bar.val(progress_bar.val() + 1);
      return order.execute() ? delay(500) : null;
    });
  };

  for (var i = 0; i < orders.length; i++) {
    _loop(i);
  }

  execute_promise = execute_promise["catch"](console.error.bind(console));

  return execute_promise;
};

function clearSimulation() {
  "use strict";

  $("." + constants.SIMULATION_BTN_CLASS).each(function (i, e) {
    return $(e).removeClass(constants.SIMULATION_BTN_CLASS);
  });
}
exports.clearSimulation = clearSimulation;

exports.simulate = function () {
  "use strict";

  // Remove previous simulation
  clearSimulation();

  // Gather villages info
  var plunderable_villages = miner.minePlunderVillages();

  // Create orders
  var orders = exports.createOrders(plunderable_villages);
  orders = _.sortByAll(orders, 'priority'); // Sort by higher priority

  // Draw simulation
  for (var i = 0; i < orders.length; i++) {
    orders[i].simulate();
  }
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"./const.js":8,"./data/bot-order.js":9,"./data/plunderable-village":10,"./miner":12,"./settings":13,"./util":16}],8:[function(require,module,exports){
"use strict";

module.exports = {
  /*** Settings ***/
  DEFAULT_SETTINGS: {
    // Defaults
    BotSettings: {
      MIN_RES: 250,
      MAX_RES: 1000,
      MAX_TEMPLATE: "A",
      THRESHOLD_DIST: 6,
      MAX_DIST: 15,
      RAM_UNITS: { spy: 1, spear: 25, sword: 50 },
      RAMS_PER_WALL_LEVEL: [0, 2, 4, 7, 11, 15, 20, 26, 33, 42, 51]
    },

    env: "prod"
  },

  /*** UI ***/
  SIMULATION_BTN_CLASS: "TWFAP-btn-simulation"
};

},{}],9:[function(require,module,exports){
(function (global){
/* global UI */
/* global TribalWars */

"use strict";

var _get = function get(_x, _x2, _x3) { var _again = true; _function: while (_again) { var object = _x, property = _x2, receiver = _x3; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x = parent; _x2 = property; _x3 = receiver; _again = true; desc = parent = undefined; continue _function; } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var $ = typeof window !== "undefined" ? window['$'] : typeof global !== "undefined" ? global['$'] : null;
var _ = typeof window !== "undefined" ? window['_'] : typeof global !== "undefined" ? global['_'] : null;
var log = require('loglevel').getLogger("BotOrder");

var constants = require('./../const.js');
var miner = require("./../miner");
var util = require("./../util");

var Order = (function () {
  function Order(plunderable_village, priority) {
    _classCallCheck(this, Order);

    this.plunderable_village = plunderable_village;
    this.priority = priority;
  }

  _createClass(Order, [{
    key: "execute",
    value: function execute() {
      ;
    }
  }, {
    key: "simulate",
    value: function simulate() {
      ;
    }
  }, {
    key: "hasEnoughUnits",
    value: function hasEnoughUnits() {
      return !_.isEmpty(this.units) && util.hasEnoughUnits(this.units);
    }
  }, {
    key: "order_button",
    get: function get() {
      throw new Error('Not implemented.');
    }
  }, {
    key: "units",
    get: function get() {
      throw Error("Not inplemented.");
    }
  }]);

  return Order;
})();

exports.Order = Order;

var TemplateOrder = (function (_Order) {
  _inherits(TemplateOrder, _Order);

  function TemplateOrder(plunderable_village, order_letter, priority) {
    _classCallCheck(this, TemplateOrder);

    if (!util.isValidOrderLetter(order_letter)) {
      throw new Error("order_letter invalid.", order_letter);
    }
    _get(Object.getPrototypeOf(TemplateOrder.prototype), "constructor", this).call(this, plunderable_village, priority);

    this.order_letter = order_letter.toLowerCase();
  }

  _createClass(TemplateOrder, [{
    key: "execute",
    value: function execute() {
      if (this.hasEnoughUnits()) {
        log.trace("TemplateOrder execute", this);
        this.order_button.click();
        return true;
      } else {
        log.trace("TemplateOrder not enough units", this);
        return false;
      }
    }
  }, {
    key: "simulate",
    value: function simulate() {
      log.trace("TemplateOrder simulate", this);

      var css_class = constants.SIMULATION_BTN_CLASS;
      this.order_button.addClass(css_class);
    }
  }, {
    key: "order_button",
    get: function get() {
      return this.plunderable_village.getOrderButton(this.order_letter);
    }
  }, {
    key: "units",
    get: function get() {
      var templates = miner.mineTemplates();

      if (this.order_letter === "a") {
        return templates["A"];
      } else if (this.order_letter === "b") {
        return templates["B"];
      } else if (this.order_letter === "c") {
        return this.plunderable_village.template_c;
      }

      throw new Error('Invalid order letter "' + this.order_letter + '".');
    }
  }]);

  return TemplateOrder;
})(Order);

exports.TemplateOrder = TemplateOrder;

var CustomOrder = (function (_Order2) {
  _inherits(CustomOrder, _Order2);

  function CustomOrder(plunderable_village, units, priority) {
    _classCallCheck(this, CustomOrder);

    var DEFAULT_UNITS = { spear: 0, sword: 0, axe: 0, archer: 0, spy: 0, light: 0, marcher: 0, heavy: 0, ram: 0, catapult: 0, knight: 0, snob: 0, militia: 0 };

    _get(Object.getPrototypeOf(CustomOrder.prototype), "constructor", this).call(this, plunderable_village, priority);

    this._units = _.defaults(units, DEFAULT_UNITS);
  }

  _createClass(CustomOrder, [{
    key: "execute",
    value: function execute() {
      var _this = this;

      if (!this.hasEnoughUnits()) {
        log.trace("TemplateOrder not enough units", this);
        return;
      }

      var pv = this.plunderable_village;

      // Open the command popup
      var params = $.extend({ ajax: 'command' }, { target: pv.id });

      TribalWars.get('place', params, // Send request for a command popup
      function (response) {
        var d_jq = $("<div>" + response.dialog + "</div>");

        // Units
        _.forIn(_this.units, function (v, k) {
          return d_jq.find("#command-data-form input[name=" + k + "]").val(v);
        });

        // Position
        d_jq.find("#command-data-form input[name=x]").val(pv.coordinates.x);
        d_jq.find("#command-data-form input[name=y]").val(pv.coordinates.y);

        var data = d_jq.find("#command-data-form").serializeArray();
        data.push({ name: "attack", value: 'l' });

        TribalWars.post('place', { ajax: 'confirm' }, data, // Confirm attack
        function (response_confirm) {
          var d_confirm_jq = $("<div>" + response_confirm.dialog + "</div>");
          var confirm_data = d_confirm_jq.find('#command-data-form').serializeArray();

          TribalWars.post('place', { ajaxaction: 'popup_command' }, confirm_data, // Final response
          function (response_final) {
            UI.SuccessMessage(response_final.message);
            console.log(response_final);
          });
        });
      });
    }
  }, {
    key: "simulate",
    value: function simulate() {
      log.trace("CustomOrder simulate", this);

      var css_class = constants.SIMULATION_BTN_CLASS;
      this.order_button.addClass(css_class);
    }
  }, {
    key: "order_button",
    get: function get() {
      return this.plunderable_village.attack_place_button;
    }
  }, {
    key: "units",
    get: function get() {
      return this._units;
    }
  }]);

  return CustomOrder;
})(Order);

exports.CustomOrder = CustomOrder;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"./../const.js":8,"./../miner":12,"./../util":16,"loglevel":6}],10:[function(require,module,exports){
(function (global){
"use strict";

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var $ = typeof window !== "undefined" ? window['$'] : typeof global !== "undefined" ? global['$'] : null;
var _ = typeof window !== "undefined" ? window['_'] : typeof global !== "undefined" ? global['_'] : null;
var log = require('loglevel').getLogger("PlunderableVillage");

var util = require("./../util");

module.exports = (function () {
  function PlunderableVillage(id, report_id, coordinates, is_attacking, res, wall, distance, template_c) {
    "use strict";

    _classCallCheck(this, PlunderableVillage);

    this.id = id;
    this.report_id = report_id;
    this.coordinates = coordinates;
    this.is_attacking = is_attacking;
    this.res = res;
    this.wall = wall;
    this.distance = distance;
    this.template_c = template_c;
  }

  _createClass(PlunderableVillage, [{
    key: "getTotalRes",
    value: function getTotalRes() {
      "use strict";

      return _.sum(_.values(this.res));
    }
  }, {
    key: "getOrderButton",
    value: function getOrderButton(order_letter) {
      if (!util.isValidOrderLetter(order_letter)) {
        // order_letter isn't a, b or c
        throw new Error('"' + order_letter + '"is not a valid order_letter. Must be A, B or C (case insensitive).');
      }

      order_letter = order_letter.toLowerCase();

      var query = ".farm_icon_" + order_letter;
      return this.TR.find(query);
    }
  }, {
    key: "isOrderAvaiable",
    value: function isOrderAvaiable(order_letter) {
      return this.getOrderButton(order_letter).hasClass("farm_icon_disabled");
    }
  }, {
    key: "clickOrder",
    value: function clickOrder(order_letter) {
      log.info("clicked", order_letter, this);
      this.getOrderButton(order_letter).click();
    }
  }, {
    key: "TR",
    get: function get() {
      "use strict";

      return $('#' + this.tr_id).first();
    }
  }, {
    key: "tr_id",
    get: function get() {
      return "village_" + this.id;
    }
  }, {
    key: "attack_place_button",
    get: function get() {
      return this.TR.find("img[src*=place]");
    }
  }]);

  return PlunderableVillage;
})();

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"./../util":16,"loglevel":6}],11:[function(require,module,exports){
(function (global){
"use strict";

var $ = typeof window !== "undefined" ? window['$'] : typeof global !== "undefined" ? global['$'] : null;
var _ = typeof window !== "undefined" ? window['_'] : typeof global !== "undefined" ? global['_'] : null;
var log = require('loglevel');

var Settings = require("./settings");

function setLogLevel() {
  if (Settings.env === "dev") {
    log.setLevel(log.levels.TRACE, false);
  } else {
    log.setLevel(log.levels.ERROR, false);
  }
}
setLogLevel();

var UI = require("./ui");

/*** Global Fns ***/
window.TWFAP_Toggle_Env = function () {
  Settings.env = Settings.env === "prod" ? "dev" : "prod";
  setLogLevel();

  console.log("Enviroment is now:", Settings.env);
};

/*** Execution ***/
UI.injectUI();

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"./settings":13,"./ui":15,"loglevel":6}],12:[function(require,module,exports){
(function (global){
"use strict";

var $ = typeof window !== "undefined" ? window['$'] : typeof global !== "undefined" ? global['$'] : null;
var _ = typeof window !== "undefined" ? window['_'] : typeof global !== "undefined" ? global['_'] : null;
var log = require('loglevel').getLogger("Miner");

var PlunderableVillage = require("./data/plunderable-village");
var Miner = require("./miner");

exports.parseResource = function (res_text) {
  "use strict";

  // Raw format: "  1.652 950 2.015 "
  var r = _(res_text).replace(/\./g, "").trim().split(" ").filter(function (x) {
    return x !== "";
  }).map(_.parseInt);

  return { wood: r[0], stone: r[1], iron: r[2] };
};

exports.parseCoordinates = function (position_text) {
  var pos = /\((\d+)\|(\d+)\)/.exec(position_text);
  return { x: _.parseInt(pos[1]), y: _.parseInt(pos[2]) };
};

exports.minePlunderVillages = function () {
  "use strict";

  var plunderable_villages = [];

  // Get villages data
  $("#plunder_list [id*=village_]").each(function (index, element) {

    var je = $(element);

    var tr_id = je.attr("id");
    var id = _.parseInt(_.first(/\d+/.exec(tr_id)));
    var report_id = _.parseInt(_.last(/view=(\d+)/.exec(je.find("a[href*=report]").attr("href"))));
    var coordinates = Miner.parseCoordinates(je.find("a[href*=report]").text());
    var is_attacking = !_.isEmpty(je.find("img[src*=attack]"));
    var res = Miner.parseResource(je.find("td:nth-child(6)").text());
    var wall = _.parseInt(je.find("td:nth-child(7)").text());
    var distance = parseFloat(je.find("td:nth-child(8)").text());

    // Template C
    var template_c_a = je.find("a[data-units-forecast]");
    var template_c = {};
    if (!template_c_a.hasClass("farm_icon_disabled")) {
      template_c = JSON.parse(template_c_a.attr("data-units-forecast"));
    }

    // Create object
    var pv = new PlunderableVillage(id, report_id, coordinates, is_attacking, res, wall, distance, template_c);

    log.trace("Mined village", pv);

    plunderable_villages.push(pv);
  });

  return plunderable_villages;
};

exports.mineCurrentUnits = function () {
  return window.Accountmanager.farm.current_units;
};

exports.mineTemplates = _.once(function () {
  var DEFAULT_TEMPLATE = { spear: 0, sword: 0, axe: 0, archer: 0, spy: 0, light: 0, marcher: 0, heavy: 0, knight: 0 };

  var templates = window.Accountmanager.farm.templates;
  var templates_keys = _.keys(window.Accountmanager.farm.templates);

  var template_A = _.defaults(templates[_.first(templates_keys)], DEFAULT_TEMPLATE);
  var template_B = _.defaults(templates[_.first(templates_keys)], DEFAULT_TEMPLATE);

  templates = { A: template_A, B: template_B };

  log.trace("Mined templates", templates);

  return templates;
});

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"./data/plunderable-village":10,"./miner":12,"loglevel":6}],13:[function(require,module,exports){
(function (global){
/*** Imports ***/
"use strict";

var _ = typeof window !== "undefined" ? window['_'] : typeof global !== "undefined" ? global['_'] : null;

var Storage = require('./storage');
var constants = require('./const');

// Consts
var SETTINGS_STORAGE_NAME = "Settings";

var Settings = _.defaultsDeep(Storage.get(SETTINGS_STORAGE_NAME, {}), constants.DEFAULT_SETTINGS);

Object.observe(Settings, function (changes) {
  Storage.set(SETTINGS_STORAGE_NAME, _.last(changes).object);
});

module.exports = Settings;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"./const":8,"./storage":14}],14:[function(require,module,exports){
(function (global){
/* global GM_setValue */
/* global GM_getValue */

"use strict";

var _ = typeof window !== "undefined" ? window['_'] : typeof global !== "undefined" ? global['_'] : null;

exports.get = function (name, defaulty) {
  return GM_getValue(name, defaulty);
};

exports.set = function (name, value) {
  return GM_setValue(name, value);
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],15:[function(require,module,exports){
(function (global,Buffer){
/* global GM_addStyle */

"use strict";

var $ = typeof window !== "undefined" ? window['$'] : typeof global !== "undefined" ? global['$'] : null;
var _ = typeof window !== "undefined" ? window['_'] : typeof global !== "undefined" ? global['_'] : null;
var log = require('loglevel').getLogger("UI");
var StateMachine = require("javascript-state-machine");

var constants = require("./const");
var settings = require("./settings");
var miner = require("./miner");
var bot = require("./bot");

/*** Execution FSM ***/
var execution_fsm = StateMachine.create({
  initial: 'init',
  events: [{ name: 'execute', from: 'init', to: 'executing' }, { name: 'done', from: 'executing', to: 'executed' }, { name: 'reload', from: 'executed', to: 'reloading' }] });

execution_fsm.onexecute = function () {
  bot.execute().then(_.bind(execution_fsm.done, execution_fsm));
};

execution_fsm.onreload = function () {
  location.reload();
};

function appendTotalResCol() {
  /** Append total resources to resources column **/
  $('#plunder_list tr td:nth-child(6)').each(function () {
    "use strict";

    var res_jq = $(this);
    var res = miner.parseResource(res_jq.text());
    var res_sum = _.sum(_.values(res));

    res_jq.append(' <span class="icon header ressources"></span> ' + res_sum);
  });
}

exports.injectUI = function () {
  // Load files
  var ui_html = "<div class=\"vis\">\r\n  <table style=\"width:100%\">\r\n    <tbody>\r\n      <tr> <!-- Header -->\r\n        \r\n        <th class=\"vis\">\r\n          <h4>TWFAP: </h4>\r\n        </th>\r\n        \r\n      </tr>\r\n       \r\n      \r\n      <tr> <!-- Configs -->\r\n        \r\n        <td>\r\n          <input id=\"TWFAP-btn-execute\" type=\"submit\" value=\"Exectute Farm\" class=\"btn\" style=\"float: left;\" />\r\n          \r\n          <input id=\"TWFAP-btn-simulate\" type=\"submit\" value=\"Simulate Farm\" class=\"btn\" style=\"float: left;\" />\r\n          \r\n          <input id=\"TWFAP-btn-clear-simulation\" type=\"submit\" value=\"Clear Simulation\" class=\"btn\" style=\"float: left;\" />\r\n          \r\n          \r\n        </td>\r\n        \r\n      </tr>\r\n      \r\n      <tr>\r\n        <td>\r\n          <progress id=\"TWFAP-progress-execution\" value=\"0\" max=\"0\" style=\"width:100%;\"></progress>\r\n        </td>\r\n      </tr>      \r\n      \r\n      <tr>\r\n        <td>\r\n          <textarea id=\"TWFAP-txtarea-settings\" rows=\"10\" style=\"width:100%;\"></textarea>\r\n        </td>\r\n      </tr>\r\n      \r\n      <tr>\r\n        <td>\r\n          <input id=\"TWFAP-btn-save-settings\" type=\"submit\" value=\"Save settings\" class=\"btn\" style=\"float: right;\" />\r\n          \r\n          <input id=\"TWFAP-btn-reset-settings\" type=\"submit\" value=\"Reset settings\" class=\"btn\" style=\"float: right;\" />\r\n        </td>\r\n      </tr>\r\n      \r\n          \r\n    </tbody>\r\n  </table>\r\n</div>\r\n";
  var css = Buffer("LlRXRlAtYnRuLXNpbXVsYXRpb24gew0KICBib3JkZXIgOiAzcHggZGFzaGVkIGdyZWVuOw0KfQ==", "base64");

  // Inject stylesheet
  GM_addStyle(css);

  // Inject bot interface
  $("#farm_units").parent().after(ui_html);

  // Bind events
  $("#TWFAP-btn-execute").click(function () {
    if (execution_fsm.can("execute")) {
      execution_fsm.execute();
    } else {
      execution_fsm.reload();
    }
  });

  $("#TWFAP-btn-simulate").click(_.bind(bot.simulate, bot));
  $("#TWFAP-btn-clear-simulation").click(_.bind(bot.clearSimulation, bot));
  $("#TWFAP-txtarea-settings").val(JSON.stringify(settings));

  $("#TWFAP-btn-save-settings").click(function () {
    var newSettings = JSON.parse($("#TWFAP-txtarea-settings").val());
    log.info("UI new Settings:", newSettings);

    for (var member in settings) delete settings[member];
    _.assign(settings, newSettings);
  });

  $("#TWFAP-btn-reset-settings").click(function () {
    var newSettings = constants.DEFAULT_SETTINGS;
    log.info("UI reset Settings:", newSettings);

    for (var member in settings) delete settings[member];
    _.assign(settings, newSettings);

    $("#TWFAP-txtarea-settings").val(JSON.stringify(settings));
  });

  appendTotalResCol();
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer)

},{"./bot":7,"./const":8,"./miner":12,"./settings":13,"buffer":1,"javascript-state-machine":5,"loglevel":6}],16:[function(require,module,exports){
(function (global){
"use strict";

var $ = typeof window !== "undefined" ? window['$'] : typeof global !== "undefined" ? global['$'] : null;
var _ = typeof window !== "undefined" ? window['_'] : typeof global !== "undefined" ? global['_'] : null;

var Settings = require("./settings");
var miner = require("./miner");

exports.maybeRunFns = function (fns, chance_of_executing, interval) {
  interval = interval || 1000;
  var fns_index = 0;

  var intervalID = setInterval(function () {
    if (fns_index >= fns.length) {
      clearInterval(intervalID);
      return;
    } else if (_.random(0, 1, true) < chance_of_executing) {
      fns[fns_index++]();
    }
  }, 1000);
};

exports.isValidOrderLetter = function (order_letter) {
  try {
    return typeof order_letter === "string" && order_letter.length === 1 && /[a|b|c]/i.test(order_letter);
  } catch (error) {
    return false;
  }
};

exports.hasEnoughUnits = function (units) {
  var current_units = miner.mineCurrentUnits();

  return _.all(_.map(_.keys(units), function (k) {
    return current_units[k] >= units[k];
  }));
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"./miner":12,"./settings":13}]},{},[11])
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnVmZmVyL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2J1ZmZlci9ub2RlX21vZHVsZXMvYmFzZTY0LWpzL2xpYi9iNjQuanMiLCJub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnVmZmVyL25vZGVfbW9kdWxlcy9pZWVlNzU0L2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2J1ZmZlci9ub2RlX21vZHVsZXMvaXMtYXJyYXkvaW5kZXguanMiLCJub2RlX21vZHVsZXMvamF2YXNjcmlwdC1zdGF0ZS1tYWNoaW5lL3N0YXRlLW1hY2hpbmUuanMiLCJub2RlX21vZHVsZXMvbG9nbGV2ZWwvbGliL2xvZ2xldmVsLmpzIiwiYzovVXNlcnMvVlRNL0RvY3VtZW50cy9UcmliYWwgV2Fycy9UcmliYWwtV2Fycy1GYXJtLUFzc2lzdGFudC1QbHVzL3NyYy9qcy9ib3QuanMiLCJjOi9Vc2Vycy9WVE0vRG9jdW1lbnRzL1RyaWJhbCBXYXJzL1RyaWJhbC1XYXJzLUZhcm0tQXNzaXN0YW50LVBsdXMvc3JjL2pzL2NvbnN0LmpzIiwiYzovVXNlcnMvVlRNL0RvY3VtZW50cy9UcmliYWwgV2Fycy9UcmliYWwtV2Fycy1GYXJtLUFzc2lzdGFudC1QbHVzL3NyYy9qcy9kYXRhL2JvdC1vcmRlci5qcyIsImM6L1VzZXJzL1ZUTS9Eb2N1bWVudHMvVHJpYmFsIFdhcnMvVHJpYmFsLVdhcnMtRmFybS1Bc3Npc3RhbnQtUGx1cy9zcmMvanMvZGF0YS9wbHVuZGVyYWJsZS12aWxsYWdlLmpzIiwiYzovVXNlcnMvVlRNL0RvY3VtZW50cy9UcmliYWwgV2Fycy9UcmliYWwtV2Fycy1GYXJtLUFzc2lzdGFudC1QbHVzL3NyYy9qcy9pbmRleC5qcyIsImM6L1VzZXJzL1ZUTS9Eb2N1bWVudHMvVHJpYmFsIFdhcnMvVHJpYmFsLVdhcnMtRmFybS1Bc3Npc3RhbnQtUGx1cy9zcmMvanMvbWluZXIuanMiLCJjOi9Vc2Vycy9WVE0vRG9jdW1lbnRzL1RyaWJhbCBXYXJzL1RyaWJhbC1XYXJzLUZhcm0tQXNzaXN0YW50LVBsdXMvc3JjL2pzL3NldHRpbmdzLmpzIiwiYzovVXNlcnMvVlRNL0RvY3VtZW50cy9UcmliYWwgV2Fycy9UcmliYWwtV2Fycy1GYXJtLUFzc2lzdGFudC1QbHVzL3NyYy9qcy9zdG9yYWdlLmpzIiwiYzovVXNlcnMvVlRNL0RvY3VtZW50cy9UcmliYWwgV2Fycy9UcmliYWwtV2Fycy1GYXJtLUFzc2lzdGFudC1QbHVzL3NyYy9qcy91aS5qcyIsImM6L1VzZXJzL1ZUTS9Eb2N1bWVudHMvVHJpYmFsIFdhcnMvVHJpYmFsLVdhcnMtRmFybS1Bc3Npc3RhbnQtUGx1cy9zcmMvanMvdXRpbC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUN4Z0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25PQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7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T0FBTyxZQUFZLEtBQUssUUFBUSxJQUNyQyxZQUFZLENBQUMsTUFBTSxLQUFLLENBQUMsSUFDekIsVUFBVSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztHQUNqQyxDQUFDLE9BQU8sS0FBSyxFQUFFO0FBQ2QsV0FBTyxLQUFLLENBQUM7R0FDZDtDQUNGLENBQUE7O0FBRUQsT0FBTyxDQUFDLGNBQWMsR0FBRyxVQUFVLEtBQUssRUFBRTtBQUN4QyxNQUFJLGFBQWEsR0FBRyxLQUFLLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQzs7QUFFN0MsU0FBTyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxVQUFTLENBQUMsRUFBRTtBQUFFLFdBQU8sYUFBYSxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztHQUFFLENBQUMsQ0FBQyxDQUFDO0NBQzFGLENBQUEiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiLyohXG4gKiBUaGUgYnVmZmVyIG1vZHVsZSBmcm9tIG5vZGUuanMsIGZvciB0aGUgYnJvd3Nlci5cbiAqXG4gKiBAYXV0aG9yICAgRmVyb3NzIEFib3VraGFkaWplaCA8ZmVyb3NzQGZlcm9zcy5vcmc+IDxodHRwOi8vZmVyb3NzLm9yZz5cbiAqIEBsaWNlbnNlICBNSVRcbiAqL1xuLyogZXNsaW50LWRpc2FibGUgbm8tcHJvdG8gKi9cblxudmFyIGJhc2U2NCA9IHJlcXVpcmUoJ2Jhc2U2NC1qcycpXG52YXIgaWVlZTc1NCA9IHJlcXVpcmUoJ2llZWU3NTQnKVxudmFyIGlzQXJyYXkgPSByZXF1aXJlKCdpcy1hcnJheScpXG5cbmV4cG9ydHMuQnVmZmVyID0gQnVmZmVyXG5leHBvcnRzLlNsb3dCdWZmZXIgPSBTbG93QnVmZmVyXG5leHBvcnRzLklOU1BFQ1RfTUFYX0JZVEVTID0gNTBcbkJ1ZmZlci5wb29sU2l6ZSA9IDgxOTIgLy8gbm90IHVzZWQgYnkgdGhpcyBpbXBsZW1lbnRhdGlvblxuXG52YXIgcm9vdFBhcmVudCA9IHt9XG5cbi8qKlxuICogSWYgYEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUYDpcbiAqICAgPT09IHRydWUgICAgVXNlIFVpbnQ4QXJyYXkgaW1wbGVtZW50YXRpb24gKGZhc3Rlc3QpXG4gKiAgID09PSBmYWxzZSAgIFVzZSBPYmplY3QgaW1wbGVtZW50YXRpb24gKG1vc3QgY29tcGF0aWJsZSwgZXZlbiBJRTYpXG4gKlxuICogQnJvd3NlcnMgdGhhdCBzdXBwb3J0IHR5cGVkIGFycmF5cyBhcmUgSUUgMTArLCBGaXJlZm94IDQrLCBDaHJvbWUgNyssIFNhZmFyaSA1LjErLFxuICogT3BlcmEgMTEuNissIGlPUyA0LjIrLlxuICpcbiAqIER1ZSB0byB2YXJpb3VzIGJyb3dzZXIgYnVncywgc29tZXRpbWVzIHRoZSBPYmplY3QgaW1wbGVtZW50YXRpb24gd2lsbCBiZSB1c2VkIGV2ZW5cbiAqIHdoZW4gdGhlIGJyb3dzZXIgc3VwcG9ydHMgdHlwZWQgYXJyYXlzLlxuICpcbiAqIE5vdGU6XG4gKlxuICogICAtIEZpcmVmb3ggNC0yOSBsYWNrcyBzdXBwb3J0IGZvciBhZGRpbmcgbmV3IHByb3BlcnRpZXMgdG8gYFVpbnQ4QXJyYXlgIGluc3RhbmNlcyxcbiAqICAgICBTZWU6IGh0dHBzOi8vYnVnemlsbGEubW96aWxsYS5vcmcvc2hvd19idWcuY2dpP2lkPTY5NTQzOC5cbiAqXG4gKiAgIC0gU2FmYXJpIDUtNyBsYWNrcyBzdXBwb3J0IGZvciBjaGFuZ2luZyB0aGUgYE9iamVjdC5wcm90b3R5cGUuY29uc3RydWN0b3JgIHByb3BlcnR5XG4gKiAgICAgb24gb2JqZWN0cy5cbiAqXG4gKiAgIC0gQ2hyb21lIDktMTAgaXMgbWlzc2luZyB0aGUgYFR5cGVkQXJyYXkucHJvdG90eXBlLnN1YmFycmF5YCBmdW5jdGlvbi5cbiAqXG4gKiAgIC0gSUUxMCBoYXMgYSBicm9rZW4gYFR5cGVkQXJyYXkucHJvdG90eXBlLnN1YmFycmF5YCBmdW5jdGlvbiB3aGljaCByZXR1cm5zIGFycmF5cyBvZlxuICogICAgIGluY29ycmVjdCBsZW5ndGggaW4gc29tZSBzaXR1YXRpb25zLlxuXG4gKiBXZSBkZXRlY3QgdGhlc2UgYnVnZ3kgYnJvd3NlcnMgYW5kIHNldCBgQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlRgIHRvIGBmYWxzZWAgc28gdGhleVxuICogZ2V0IHRoZSBPYmplY3QgaW1wbGVtZW50YXRpb24sIHdoaWNoIGlzIHNsb3dlciBidXQgYmVoYXZlcyBjb3JyZWN0bHkuXG4gKi9cbkJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUID0gZ2xvYmFsLlRZUEVEX0FSUkFZX1NVUFBPUlQgIT09IHVuZGVmaW5lZFxuICA/IGdsb2JhbC5UWVBFRF9BUlJBWV9TVVBQT1JUXG4gIDogdHlwZWRBcnJheVN1cHBvcnQoKVxuXG5mdW5jdGlvbiB0eXBlZEFycmF5U3VwcG9ydCAoKSB7XG4gIGZ1bmN0aW9uIEJhciAoKSB7fVxuICB0cnkge1xuICAgIHZhciBhcnIgPSBuZXcgVWludDhBcnJheSgxKVxuICAgIGFyci5mb28gPSBmdW5jdGlvbiAoKSB7IHJldHVybiA0MiB9XG4gICAgYXJyLmNvbnN0cnVjdG9yID0gQmFyXG4gICAgcmV0dXJuIGFyci5mb28oKSA9PT0gNDIgJiYgLy8gdHlwZWQgYXJyYXkgaW5zdGFuY2VzIGNhbiBiZSBhdWdtZW50ZWRcbiAgICAgICAgYXJyLmNvbnN0cnVjdG9yID09PSBCYXIgJiYgLy8gY29uc3RydWN0b3IgY2FuIGJlIHNldFxuICAgICAgICB0eXBlb2YgYXJyLnN1YmFycmF5ID09PSAnZnVuY3Rpb24nICYmIC8vIGNocm9tZSA5LTEwIGxhY2sgYHN1YmFycmF5YFxuICAgICAgICBhcnIuc3ViYXJyYXkoMSwgMSkuYnl0ZUxlbmd0aCA9PT0gMCAvLyBpZTEwIGhhcyBicm9rZW4gYHN1YmFycmF5YFxuICB9IGNhdGNoIChlKSB7XG4gICAgcmV0dXJuIGZhbHNlXG4gIH1cbn1cblxuZnVuY3Rpb24ga01heExlbmd0aCAoKSB7XG4gIHJldHVybiBCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVFxuICAgID8gMHg3ZmZmZmZmZlxuICAgIDogMHgzZmZmZmZmZlxufVxuXG4vKipcbiAqIENsYXNzOiBCdWZmZXJcbiAqID09PT09PT09PT09PT1cbiAqXG4gKiBUaGUgQnVmZmVyIGNvbnN0cnVjdG9yIHJldHVybnMgaW5zdGFuY2VzIG9mIGBVaW50OEFycmF5YCB0aGF0IGFyZSBhdWdtZW50ZWRcbiAqIHdpdGggZnVuY3Rpb24gcHJvcGVydGllcyBmb3IgYWxsIHRoZSBub2RlIGBCdWZmZXJgIEFQSSBmdW5jdGlvbnMuIFdlIHVzZVxuICogYFVpbnQ4QXJyYXlgIHNvIHRoYXQgc3F1YXJlIGJyYWNrZXQgbm90YXRpb24gd29ya3MgYXMgZXhwZWN0ZWQgLS0gaXQgcmV0dXJuc1xuICogYSBzaW5nbGUgb2N0ZXQuXG4gKlxuICogQnkgYXVnbWVudGluZyB0aGUgaW5zdGFuY2VzLCB3ZSBjYW4gYXZvaWQgbW9kaWZ5aW5nIHRoZSBgVWludDhBcnJheWBcbiAqIHByb3RvdHlwZS5cbiAqL1xuZnVuY3Rpb24gQnVmZmVyIChhcmcpIHtcbiAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIEJ1ZmZlcikpIHtcbiAgICAvLyBBdm9pZCBnb2luZyB0aHJvdWdoIGFuIEFyZ3VtZW50c0FkYXB0b3JUcmFtcG9saW5lIGluIHRoZSBjb21tb24gY2FzZS5cbiAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA+IDEpIHJldHVybiBuZXcgQnVmZmVyKGFyZywgYXJndW1lbnRzWzFdKVxuICAgIHJldHVybiBuZXcgQnVmZmVyKGFyZylcbiAgfVxuXG4gIHRoaXMubGVuZ3RoID0gMFxuICB0aGlzLnBhcmVudCA9IHVuZGVmaW5lZFxuXG4gIC8vIENvbW1vbiBjYXNlLlxuICBpZiAodHlwZW9mIGFyZyA9PT0gJ251bWJlcicpIHtcbiAgICByZXR1cm4gZnJvbU51bWJlcih0aGlzLCBhcmcpXG4gIH1cblxuICAvLyBTbGlnaHRseSBsZXNzIGNvbW1vbiBjYXNlLlxuICBpZiAodHlwZW9mIGFyZyA9PT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gZnJvbVN0cmluZyh0aGlzLCBhcmcsIGFyZ3VtZW50cy5sZW5ndGggPiAxID8gYXJndW1lbnRzWzFdIDogJ3V0ZjgnKVxuICB9XG5cbiAgLy8gVW51c3VhbC5cbiAgcmV0dXJuIGZyb21PYmplY3QodGhpcywgYXJnKVxufVxuXG5mdW5jdGlvbiBmcm9tTnVtYmVyICh0aGF0LCBsZW5ndGgpIHtcbiAgdGhhdCA9IGFsbG9jYXRlKHRoYXQsIGxlbmd0aCA8IDAgPyAwIDogY2hlY2tlZChsZW5ndGgpIHwgMClcbiAgaWYgKCFCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIHRoYXRbaV0gPSAwXG4gICAgfVxuICB9XG4gIHJldHVybiB0aGF0XG59XG5cbmZ1bmN0aW9uIGZyb21TdHJpbmcgKHRoYXQsIHN0cmluZywgZW5jb2RpbmcpIHtcbiAgaWYgKHR5cGVvZiBlbmNvZGluZyAhPT0gJ3N0cmluZycgfHwgZW5jb2RpbmcgPT09ICcnKSBlbmNvZGluZyA9ICd1dGY4J1xuXG4gIC8vIEFzc3VtcHRpb246IGJ5dGVMZW5ndGgoKSByZXR1cm4gdmFsdWUgaXMgYWx3YXlzIDwga01heExlbmd0aC5cbiAgdmFyIGxlbmd0aCA9IGJ5dGVMZW5ndGgoc3RyaW5nLCBlbmNvZGluZykgfCAwXG4gIHRoYXQgPSBhbGxvY2F0ZSh0aGF0LCBsZW5ndGgpXG5cbiAgdGhhdC53cml0ZShzdHJpbmcsIGVuY29kaW5nKVxuICByZXR1cm4gdGhhdFxufVxuXG5mdW5jdGlvbiBmcm9tT2JqZWN0ICh0aGF0LCBvYmplY3QpIHtcbiAgaWYgKEJ1ZmZlci5pc0J1ZmZlcihvYmplY3QpKSByZXR1cm4gZnJvbUJ1ZmZlcih0aGF0LCBvYmplY3QpXG5cbiAgaWYgKGlzQXJyYXkob2JqZWN0KSkgcmV0dXJuIGZyb21BcnJheSh0aGF0LCBvYmplY3QpXG5cbiAgaWYgKG9iamVjdCA9PSBudWxsKSB7XG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcignbXVzdCBzdGFydCB3aXRoIG51bWJlciwgYnVmZmVyLCBhcnJheSBvciBzdHJpbmcnKVxuICB9XG5cbiAgaWYgKHR5cGVvZiBBcnJheUJ1ZmZlciAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICBpZiAob2JqZWN0LmJ1ZmZlciBpbnN0YW5jZW9mIEFycmF5QnVmZmVyKSB7XG4gICAgICByZXR1cm4gZnJvbVR5cGVkQXJyYXkodGhhdCwgb2JqZWN0KVxuICAgIH1cbiAgICBpZiAob2JqZWN0IGluc3RhbmNlb2YgQXJyYXlCdWZmZXIpIHtcbiAgICAgIHJldHVybiBmcm9tQXJyYXlCdWZmZXIodGhhdCwgb2JqZWN0KVxuICAgIH1cbiAgfVxuXG4gIGlmIChvYmplY3QubGVuZ3RoKSByZXR1cm4gZnJvbUFycmF5TGlrZSh0aGF0LCBvYmplY3QpXG5cbiAgcmV0dXJuIGZyb21Kc29uT2JqZWN0KHRoYXQsIG9iamVjdClcbn1cblxuZnVuY3Rpb24gZnJvbUJ1ZmZlciAodGhhdCwgYnVmZmVyKSB7XG4gIHZhciBsZW5ndGggPSBjaGVja2VkKGJ1ZmZlci5sZW5ndGgpIHwgMFxuICB0aGF0ID0gYWxsb2NhdGUodGhhdCwgbGVuZ3RoKVxuICBidWZmZXIuY29weSh0aGF0LCAwLCAwLCBsZW5ndGgpXG4gIHJldHVybiB0aGF0XG59XG5cbmZ1bmN0aW9uIGZyb21BcnJheSAodGhhdCwgYXJyYXkpIHtcbiAgdmFyIGxlbmd0aCA9IGNoZWNrZWQoYXJyYXkubGVuZ3RoKSB8IDBcbiAgdGhhdCA9IGFsbG9jYXRlKHRoYXQsIGxlbmd0aClcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkgKz0gMSkge1xuICAgIHRoYXRbaV0gPSBhcnJheVtpXSAmIDI1NVxuICB9XG4gIHJldHVybiB0aGF0XG59XG5cbi8vIER1cGxpY2F0ZSBvZiBmcm9tQXJyYXkoKSB0byBrZWVwIGZyb21BcnJheSgpIG1vbm9tb3JwaGljLlxuZnVuY3Rpb24gZnJvbVR5cGVkQXJyYXkgKHRoYXQsIGFycmF5KSB7XG4gIHZhciBsZW5ndGggPSBjaGVja2VkKGFycmF5Lmxlbmd0aCkgfCAwXG4gIHRoYXQgPSBhbGxvY2F0ZSh0aGF0LCBsZW5ndGgpXG4gIC8vIFRydW5jYXRpbmcgdGhlIGVsZW1lbnRzIGlzIHByb2JhYmx5IG5vdCB3aGF0IHBlb3BsZSBleHBlY3QgZnJvbSB0eXBlZFxuICAvLyBhcnJheXMgd2l0aCBCWVRFU19QRVJfRUxFTUVOVCA+IDEgYnV0IGl0J3MgY29tcGF0aWJsZSB3aXRoIHRoZSBiZWhhdmlvclxuICAvLyBvZiB0aGUgb2xkIEJ1ZmZlciBjb25zdHJ1Y3Rvci5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkgKz0gMSkge1xuICAgIHRoYXRbaV0gPSBhcnJheVtpXSAmIDI1NVxuICB9XG4gIHJldHVybiB0aGF0XG59XG5cbmZ1bmN0aW9uIGZyb21BcnJheUJ1ZmZlciAodGhhdCwgYXJyYXkpIHtcbiAgaWYgKEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUKSB7XG4gICAgLy8gUmV0dXJuIGFuIGF1Z21lbnRlZCBgVWludDhBcnJheWAgaW5zdGFuY2UsIGZvciBiZXN0IHBlcmZvcm1hbmNlXG4gICAgYXJyYXkuYnl0ZUxlbmd0aFxuICAgIHRoYXQgPSBCdWZmZXIuX2F1Z21lbnQobmV3IFVpbnQ4QXJyYXkoYXJyYXkpKVxuICB9IGVsc2Uge1xuICAgIC8vIEZhbGxiYWNrOiBSZXR1cm4gYW4gb2JqZWN0IGluc3RhbmNlIG9mIHRoZSBCdWZmZXIgY2xhc3NcbiAgICB0aGF0ID0gZnJvbVR5cGVkQXJyYXkodGhhdCwgbmV3IFVpbnQ4QXJyYXkoYXJyYXkpKVxuICB9XG4gIHJldHVybiB0aGF0XG59XG5cbmZ1bmN0aW9uIGZyb21BcnJheUxpa2UgKHRoYXQsIGFycmF5KSB7XG4gIHZhciBsZW5ndGggPSBjaGVja2VkKGFycmF5Lmxlbmd0aCkgfCAwXG4gIHRoYXQgPSBhbGxvY2F0ZSh0aGF0LCBsZW5ndGgpXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpICs9IDEpIHtcbiAgICB0aGF0W2ldID0gYXJyYXlbaV0gJiAyNTVcbiAgfVxuICByZXR1cm4gdGhhdFxufVxuXG4vLyBEZXNlcmlhbGl6ZSB7IHR5cGU6ICdCdWZmZXInLCBkYXRhOiBbMSwyLDMsLi4uXSB9IGludG8gYSBCdWZmZXIgb2JqZWN0LlxuLy8gUmV0dXJucyBhIHplcm8tbGVuZ3RoIGJ1ZmZlciBmb3IgaW5wdXRzIHRoYXQgZG9uJ3QgY29uZm9ybSB0byB0aGUgc3BlYy5cbmZ1bmN0aW9uIGZyb21Kc29uT2JqZWN0ICh0aGF0LCBvYmplY3QpIHtcbiAgdmFyIGFycmF5XG4gIHZhciBsZW5ndGggPSAwXG5cbiAgaWYgKG9iamVjdC50eXBlID09PSAnQnVmZmVyJyAmJiBpc0FycmF5KG9iamVjdC5kYXRhKSkge1xuICAgIGFycmF5ID0gb2JqZWN0LmRhdGFcbiAgICBsZW5ndGggPSBjaGVja2VkKGFycmF5Lmxlbmd0aCkgfCAwXG4gIH1cbiAgdGhhdCA9IGFsbG9jYXRlKHRoYXQsIGxlbmd0aClcblxuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSArPSAxKSB7XG4gICAgdGhhdFtpXSA9IGFycmF5W2ldICYgMjU1XG4gIH1cbiAgcmV0dXJuIHRoYXRcbn1cblxuaWYgKEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUKSB7XG4gIEJ1ZmZlci5wcm90b3R5cGUuX19wcm90b19fID0gVWludDhBcnJheS5wcm90b3R5cGVcbiAgQnVmZmVyLl9fcHJvdG9fXyA9IFVpbnQ4QXJyYXlcbn1cblxuZnVuY3Rpb24gYWxsb2NhdGUgKHRoYXQsIGxlbmd0aCkge1xuICBpZiAoQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHtcbiAgICAvLyBSZXR1cm4gYW4gYXVnbWVudGVkIGBVaW50OEFycmF5YCBpbnN0YW5jZSwgZm9yIGJlc3QgcGVyZm9ybWFuY2VcbiAgICB0aGF0ID0gQnVmZmVyLl9hdWdtZW50KG5ldyBVaW50OEFycmF5KGxlbmd0aCkpXG4gICAgdGhhdC5fX3Byb3RvX18gPSBCdWZmZXIucHJvdG90eXBlXG4gIH0gZWxzZSB7XG4gICAgLy8gRmFsbGJhY2s6IFJldHVybiBhbiBvYmplY3QgaW5zdGFuY2Ugb2YgdGhlIEJ1ZmZlciBjbGFzc1xuICAgIHRoYXQubGVuZ3RoID0gbGVuZ3RoXG4gICAgdGhhdC5faXNCdWZmZXIgPSB0cnVlXG4gIH1cblxuICB2YXIgZnJvbVBvb2wgPSBsZW5ndGggIT09IDAgJiYgbGVuZ3RoIDw9IEJ1ZmZlci5wb29sU2l6ZSA+Pj4gMVxuICBpZiAoZnJvbVBvb2wpIHRoYXQucGFyZW50ID0gcm9vdFBhcmVudFxuXG4gIHJldHVybiB0aGF0XG59XG5cbmZ1bmN0aW9uIGNoZWNrZWQgKGxlbmd0aCkge1xuICAvLyBOb3RlOiBjYW5ub3QgdXNlIGBsZW5ndGggPCBrTWF4TGVuZ3RoYCBoZXJlIGJlY2F1c2UgdGhhdCBmYWlscyB3aGVuXG4gIC8vIGxlbmd0aCBpcyBOYU4gKHdoaWNoIGlzIG90aGVyd2lzZSBjb2VyY2VkIHRvIHplcm8uKVxuICBpZiAobGVuZ3RoID49IGtNYXhMZW5ndGgoKSkge1xuICAgIHRocm93IG5ldyBSYW5nZUVycm9yKCdBdHRlbXB0IHRvIGFsbG9jYXRlIEJ1ZmZlciBsYXJnZXIgdGhhbiBtYXhpbXVtICcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICdzaXplOiAweCcgKyBrTWF4TGVuZ3RoKCkudG9TdHJpbmcoMTYpICsgJyBieXRlcycpXG4gIH1cbiAgcmV0dXJuIGxlbmd0aCB8IDBcbn1cblxuZnVuY3Rpb24gU2xvd0J1ZmZlciAoc3ViamVjdCwgZW5jb2RpbmcpIHtcbiAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIFNsb3dCdWZmZXIpKSByZXR1cm4gbmV3IFNsb3dCdWZmZXIoc3ViamVjdCwgZW5jb2RpbmcpXG5cbiAgdmFyIGJ1ZiA9IG5ldyBCdWZmZXIoc3ViamVjdCwgZW5jb2RpbmcpXG4gIGRlbGV0ZSBidWYucGFyZW50XG4gIHJldHVybiBidWZcbn1cblxuQnVmZmVyLmlzQnVmZmVyID0gZnVuY3Rpb24gaXNCdWZmZXIgKGIpIHtcbiAgcmV0dXJuICEhKGIgIT0gbnVsbCAmJiBiLl9pc0J1ZmZlcilcbn1cblxuQnVmZmVyLmNvbXBhcmUgPSBmdW5jdGlvbiBjb21wYXJlIChhLCBiKSB7XG4gIGlmICghQnVmZmVyLmlzQnVmZmVyKGEpIHx8ICFCdWZmZXIuaXNCdWZmZXIoYikpIHtcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdBcmd1bWVudHMgbXVzdCBiZSBCdWZmZXJzJylcbiAgfVxuXG4gIGlmIChhID09PSBiKSByZXR1cm4gMFxuXG4gIHZhciB4ID0gYS5sZW5ndGhcbiAgdmFyIHkgPSBiLmxlbmd0aFxuXG4gIHZhciBpID0gMFxuICB2YXIgbGVuID0gTWF0aC5taW4oeCwgeSlcbiAgd2hpbGUgKGkgPCBsZW4pIHtcbiAgICBpZiAoYVtpXSAhPT0gYltpXSkgYnJlYWtcblxuICAgICsraVxuICB9XG5cbiAgaWYgKGkgIT09IGxlbikge1xuICAgIHggPSBhW2ldXG4gICAgeSA9IGJbaV1cbiAgfVxuXG4gIGlmICh4IDwgeSkgcmV0dXJuIC0xXG4gIGlmICh5IDwgeCkgcmV0dXJuIDFcbiAgcmV0dXJuIDBcbn1cblxuQnVmZmVyLmlzRW5jb2RpbmcgPSBmdW5jdGlvbiBpc0VuY29kaW5nIChlbmNvZGluZykge1xuICBzd2l0Y2ggKFN0cmluZyhlbmNvZGluZykudG9Mb3dlckNhc2UoKSkge1xuICAgIGNhc2UgJ2hleCc6XG4gICAgY2FzZSAndXRmOCc6XG4gICAgY2FzZSAndXRmLTgnOlxuICAgIGNhc2UgJ2FzY2lpJzpcbiAgICBjYXNlICdiaW5hcnknOlxuICAgIGNhc2UgJ2Jhc2U2NCc6XG4gICAgY2FzZSAncmF3JzpcbiAgICBjYXNlICd1Y3MyJzpcbiAgICBjYXNlICd1Y3MtMic6XG4gICAgY2FzZSAndXRmMTZsZSc6XG4gICAgY2FzZSAndXRmLTE2bGUnOlxuICAgICAgcmV0dXJuIHRydWVcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIGZhbHNlXG4gIH1cbn1cblxuQnVmZmVyLmNvbmNhdCA9IGZ1bmN0aW9uIGNvbmNhdCAobGlzdCwgbGVuZ3RoKSB7XG4gIGlmICghaXNBcnJheShsaXN0KSkgdGhyb3cgbmV3IFR5cGVFcnJvcignbGlzdCBhcmd1bWVudCBtdXN0IGJlIGFuIEFycmF5IG9mIEJ1ZmZlcnMuJylcblxuICBpZiAobGlzdC5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gbmV3IEJ1ZmZlcigwKVxuICB9XG5cbiAgdmFyIGlcbiAgaWYgKGxlbmd0aCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgbGVuZ3RoID0gMFxuICAgIGZvciAoaSA9IDA7IGkgPCBsaXN0Lmxlbmd0aDsgaSsrKSB7XG4gICAgICBsZW5ndGggKz0gbGlzdFtpXS5sZW5ndGhcbiAgICB9XG4gIH1cblxuICB2YXIgYnVmID0gbmV3IEJ1ZmZlcihsZW5ndGgpXG4gIHZhciBwb3MgPSAwXG4gIGZvciAoaSA9IDA7IGkgPCBsaXN0Lmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIGl0ZW0gPSBsaXN0W2ldXG4gICAgaXRlbS5jb3B5KGJ1ZiwgcG9zKVxuICAgIHBvcyArPSBpdGVtLmxlbmd0aFxuICB9XG4gIHJldHVybiBidWZcbn1cblxuZnVuY3Rpb24gYnl0ZUxlbmd0aCAoc3RyaW5nLCBlbmNvZGluZykge1xuICBpZiAodHlwZW9mIHN0cmluZyAhPT0gJ3N0cmluZycpIHN0cmluZyA9ICcnICsgc3RyaW5nXG5cbiAgdmFyIGxlbiA9IHN0cmluZy5sZW5ndGhcbiAgaWYgKGxlbiA9PT0gMCkgcmV0dXJuIDBcblxuICAvLyBVc2UgYSBmb3IgbG9vcCB0byBhdm9pZCByZWN1cnNpb25cbiAgdmFyIGxvd2VyZWRDYXNlID0gZmFsc2VcbiAgZm9yICg7Oykge1xuICAgIHN3aXRjaCAoZW5jb2RpbmcpIHtcbiAgICAgIGNhc2UgJ2FzY2lpJzpcbiAgICAgIGNhc2UgJ2JpbmFyeSc6XG4gICAgICAvLyBEZXByZWNhdGVkXG4gICAgICBjYXNlICdyYXcnOlxuICAgICAgY2FzZSAncmF3cyc6XG4gICAgICAgIHJldHVybiBsZW5cbiAgICAgIGNhc2UgJ3V0ZjgnOlxuICAgICAgY2FzZSAndXRmLTgnOlxuICAgICAgICByZXR1cm4gdXRmOFRvQnl0ZXMoc3RyaW5nKS5sZW5ndGhcbiAgICAgIGNhc2UgJ3VjczInOlxuICAgICAgY2FzZSAndWNzLTInOlxuICAgICAgY2FzZSAndXRmMTZsZSc6XG4gICAgICBjYXNlICd1dGYtMTZsZSc6XG4gICAgICAgIHJldHVybiBsZW4gKiAyXG4gICAgICBjYXNlICdoZXgnOlxuICAgICAgICByZXR1cm4gbGVuID4+PiAxXG4gICAgICBjYXNlICdiYXNlNjQnOlxuICAgICAgICByZXR1cm4gYmFzZTY0VG9CeXRlcyhzdHJpbmcpLmxlbmd0aFxuICAgICAgZGVmYXVsdDpcbiAgICAgICAgaWYgKGxvd2VyZWRDYXNlKSByZXR1cm4gdXRmOFRvQnl0ZXMoc3RyaW5nKS5sZW5ndGggLy8gYXNzdW1lIHV0ZjhcbiAgICAgICAgZW5jb2RpbmcgPSAoJycgKyBlbmNvZGluZykudG9Mb3dlckNhc2UoKVxuICAgICAgICBsb3dlcmVkQ2FzZSA9IHRydWVcbiAgICB9XG4gIH1cbn1cbkJ1ZmZlci5ieXRlTGVuZ3RoID0gYnl0ZUxlbmd0aFxuXG4vLyBwcmUtc2V0IGZvciB2YWx1ZXMgdGhhdCBtYXkgZXhpc3QgaW4gdGhlIGZ1dHVyZVxuQnVmZmVyLnByb3RvdHlwZS5sZW5ndGggPSB1bmRlZmluZWRcbkJ1ZmZlci5wcm90b3R5cGUucGFyZW50ID0gdW5kZWZpbmVkXG5cbmZ1bmN0aW9uIHNsb3dUb1N0cmluZyAoZW5jb2RpbmcsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIGxvd2VyZWRDYXNlID0gZmFsc2VcblxuICBzdGFydCA9IHN0YXJ0IHwgMFxuICBlbmQgPSBlbmQgPT09IHVuZGVmaW5lZCB8fCBlbmQgPT09IEluZmluaXR5ID8gdGhpcy5sZW5ndGggOiBlbmQgfCAwXG5cbiAgaWYgKCFlbmNvZGluZykgZW5jb2RpbmcgPSAndXRmOCdcbiAgaWYgKHN0YXJ0IDwgMCkgc3RhcnQgPSAwXG4gIGlmIChlbmQgPiB0aGlzLmxlbmd0aCkgZW5kID0gdGhpcy5sZW5ndGhcbiAgaWYgKGVuZCA8PSBzdGFydCkgcmV0dXJuICcnXG5cbiAgd2hpbGUgKHRydWUpIHtcbiAgICBzd2l0Y2ggKGVuY29kaW5nKSB7XG4gICAgICBjYXNlICdoZXgnOlxuICAgICAgICByZXR1cm4gaGV4U2xpY2UodGhpcywgc3RhcnQsIGVuZClcblxuICAgICAgY2FzZSAndXRmOCc6XG4gICAgICBjYXNlICd1dGYtOCc6XG4gICAgICAgIHJldHVybiB1dGY4U2xpY2UodGhpcywgc3RhcnQsIGVuZClcblxuICAgICAgY2FzZSAnYXNjaWknOlxuICAgICAgICByZXR1cm4gYXNjaWlTbGljZSh0aGlzLCBzdGFydCwgZW5kKVxuXG4gICAgICBjYXNlICdiaW5hcnknOlxuICAgICAgICByZXR1cm4gYmluYXJ5U2xpY2UodGhpcywgc3RhcnQsIGVuZClcblxuICAgICAgY2FzZSAnYmFzZTY0JzpcbiAgICAgICAgcmV0dXJuIGJhc2U2NFNsaWNlKHRoaXMsIHN0YXJ0LCBlbmQpXG5cbiAgICAgIGNhc2UgJ3VjczInOlxuICAgICAgY2FzZSAndWNzLTInOlxuICAgICAgY2FzZSAndXRmMTZsZSc6XG4gICAgICBjYXNlICd1dGYtMTZsZSc6XG4gICAgICAgIHJldHVybiB1dGYxNmxlU2xpY2UodGhpcywgc3RhcnQsIGVuZClcblxuICAgICAgZGVmYXVsdDpcbiAgICAgICAgaWYgKGxvd2VyZWRDYXNlKSB0aHJvdyBuZXcgVHlwZUVycm9yKCdVbmtub3duIGVuY29kaW5nOiAnICsgZW5jb2RpbmcpXG4gICAgICAgIGVuY29kaW5nID0gKGVuY29kaW5nICsgJycpLnRvTG93ZXJDYXNlKClcbiAgICAgICAgbG93ZXJlZENhc2UgPSB0cnVlXG4gICAgfVxuICB9XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbiB0b1N0cmluZyAoKSB7XG4gIHZhciBsZW5ndGggPSB0aGlzLmxlbmd0aCB8IDBcbiAgaWYgKGxlbmd0aCA9PT0gMCkgcmV0dXJuICcnXG4gIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAwKSByZXR1cm4gdXRmOFNsaWNlKHRoaXMsIDAsIGxlbmd0aClcbiAgcmV0dXJuIHNsb3dUb1N0cmluZy5hcHBseSh0aGlzLCBhcmd1bWVudHMpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUuZXF1YWxzID0gZnVuY3Rpb24gZXF1YWxzIChiKSB7XG4gIGlmICghQnVmZmVyLmlzQnVmZmVyKGIpKSB0aHJvdyBuZXcgVHlwZUVycm9yKCdBcmd1bWVudCBtdXN0IGJlIGEgQnVmZmVyJylcbiAgaWYgKHRoaXMgPT09IGIpIHJldHVybiB0cnVlXG4gIHJldHVybiBCdWZmZXIuY29tcGFyZSh0aGlzLCBiKSA9PT0gMFxufVxuXG5CdWZmZXIucHJvdG90eXBlLmluc3BlY3QgPSBmdW5jdGlvbiBpbnNwZWN0ICgpIHtcbiAgdmFyIHN0ciA9ICcnXG4gIHZhciBtYXggPSBleHBvcnRzLklOU1BFQ1RfTUFYX0JZVEVTXG4gIGlmICh0aGlzLmxlbmd0aCA+IDApIHtcbiAgICBzdHIgPSB0aGlzLnRvU3RyaW5nKCdoZXgnLCAwLCBtYXgpLm1hdGNoKC8uezJ9L2cpLmpvaW4oJyAnKVxuICAgIGlmICh0aGlzLmxlbmd0aCA+IG1heCkgc3RyICs9ICcgLi4uICdcbiAgfVxuICByZXR1cm4gJzxCdWZmZXIgJyArIHN0ciArICc+J1xufVxuXG5CdWZmZXIucHJvdG90eXBlLmNvbXBhcmUgPSBmdW5jdGlvbiBjb21wYXJlIChiKSB7XG4gIGlmICghQnVmZmVyLmlzQnVmZmVyKGIpKSB0aHJvdyBuZXcgVHlwZUVycm9yKCdBcmd1bWVudCBtdXN0IGJlIGEgQnVmZmVyJylcbiAgaWYgKHRoaXMgPT09IGIpIHJldHVybiAwXG4gIHJldHVybiBCdWZmZXIuY29tcGFyZSh0aGlzLCBiKVxufVxuXG5CdWZmZXIucHJvdG90eXBlLmluZGV4T2YgPSBmdW5jdGlvbiBpbmRleE9mICh2YWwsIGJ5dGVPZmZzZXQpIHtcbiAgaWYgKGJ5dGVPZmZzZXQgPiAweDdmZmZmZmZmKSBieXRlT2Zmc2V0ID0gMHg3ZmZmZmZmZlxuICBlbHNlIGlmIChieXRlT2Zmc2V0IDwgLTB4ODAwMDAwMDApIGJ5dGVPZmZzZXQgPSAtMHg4MDAwMDAwMFxuICBieXRlT2Zmc2V0ID4+PSAwXG5cbiAgaWYgKHRoaXMubGVuZ3RoID09PSAwKSByZXR1cm4gLTFcbiAgaWYgKGJ5dGVPZmZzZXQgPj0gdGhpcy5sZW5ndGgpIHJldHVybiAtMVxuXG4gIC8vIE5lZ2F0aXZlIG9mZnNldHMgc3RhcnQgZnJvbSB0aGUgZW5kIG9mIHRoZSBidWZmZXJcbiAgaWYgKGJ5dGVPZmZzZXQgPCAwKSBieXRlT2Zmc2V0ID0gTWF0aC5tYXgodGhpcy5sZW5ndGggKyBieXRlT2Zmc2V0LCAwKVxuXG4gIGlmICh0eXBlb2YgdmFsID09PSAnc3RyaW5nJykge1xuICAgIGlmICh2YWwubGVuZ3RoID09PSAwKSByZXR1cm4gLTEgLy8gc3BlY2lhbCBjYXNlOiBsb29raW5nIGZvciBlbXB0eSBzdHJpbmcgYWx3YXlzIGZhaWxzXG4gICAgcmV0dXJuIFN0cmluZy5wcm90b3R5cGUuaW5kZXhPZi5jYWxsKHRoaXMsIHZhbCwgYnl0ZU9mZnNldClcbiAgfVxuICBpZiAoQnVmZmVyLmlzQnVmZmVyKHZhbCkpIHtcbiAgICByZXR1cm4gYXJyYXlJbmRleE9mKHRoaXMsIHZhbCwgYnl0ZU9mZnNldClcbiAgfVxuICBpZiAodHlwZW9mIHZhbCA9PT0gJ251bWJlcicpIHtcbiAgICBpZiAoQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQgJiYgVWludDhBcnJheS5wcm90b3R5cGUuaW5kZXhPZiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgcmV0dXJuIFVpbnQ4QXJyYXkucHJvdG90eXBlLmluZGV4T2YuY2FsbCh0aGlzLCB2YWwsIGJ5dGVPZmZzZXQpXG4gICAgfVxuICAgIHJldHVybiBhcnJheUluZGV4T2YodGhpcywgWyB2YWwgXSwgYnl0ZU9mZnNldClcbiAgfVxuXG4gIGZ1bmN0aW9uIGFycmF5SW5kZXhPZiAoYXJyLCB2YWwsIGJ5dGVPZmZzZXQpIHtcbiAgICB2YXIgZm91bmRJbmRleCA9IC0xXG4gICAgZm9yICh2YXIgaSA9IDA7IGJ5dGVPZmZzZXQgKyBpIDwgYXJyLmxlbmd0aDsgaSsrKSB7XG4gICAgICBpZiAoYXJyW2J5dGVPZmZzZXQgKyBpXSA9PT0gdmFsW2ZvdW5kSW5kZXggPT09IC0xID8gMCA6IGkgLSBmb3VuZEluZGV4XSkge1xuICAgICAgICBpZiAoZm91bmRJbmRleCA9PT0gLTEpIGZvdW5kSW5kZXggPSBpXG4gICAgICAgIGlmIChpIC0gZm91bmRJbmRleCArIDEgPT09IHZhbC5sZW5ndGgpIHJldHVybiBieXRlT2Zmc2V0ICsgZm91bmRJbmRleFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZm91bmRJbmRleCA9IC0xXG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiAtMVxuICB9XG5cbiAgdGhyb3cgbmV3IFR5cGVFcnJvcigndmFsIG11c3QgYmUgc3RyaW5nLCBudW1iZXIgb3IgQnVmZmVyJylcbn1cblxuLy8gYGdldGAgaXMgZGVwcmVjYXRlZFxuQnVmZmVyLnByb3RvdHlwZS5nZXQgPSBmdW5jdGlvbiBnZXQgKG9mZnNldCkge1xuICBjb25zb2xlLmxvZygnLmdldCgpIGlzIGRlcHJlY2F0ZWQuIEFjY2VzcyB1c2luZyBhcnJheSBpbmRleGVzIGluc3RlYWQuJylcbiAgcmV0dXJuIHRoaXMucmVhZFVJbnQ4KG9mZnNldClcbn1cblxuLy8gYHNldGAgaXMgZGVwcmVjYXRlZFxuQnVmZmVyLnByb3RvdHlwZS5zZXQgPSBmdW5jdGlvbiBzZXQgKHYsIG9mZnNldCkge1xuICBjb25zb2xlLmxvZygnLnNldCgpIGlzIGRlcHJlY2F0ZWQuIEFjY2VzcyB1c2luZyBhcnJheSBpbmRleGVzIGluc3RlYWQuJylcbiAgcmV0dXJuIHRoaXMud3JpdGVVSW50OCh2LCBvZmZzZXQpXG59XG5cbmZ1bmN0aW9uIGhleFdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgb2Zmc2V0ID0gTnVtYmVyKG9mZnNldCkgfHwgMFxuICB2YXIgcmVtYWluaW5nID0gYnVmLmxlbmd0aCAtIG9mZnNldFxuICBpZiAoIWxlbmd0aCkge1xuICAgIGxlbmd0aCA9IHJlbWFpbmluZ1xuICB9IGVsc2Uge1xuICAgIGxlbmd0aCA9IE51bWJlcihsZW5ndGgpXG4gICAgaWYgKGxlbmd0aCA+IHJlbWFpbmluZykge1xuICAgICAgbGVuZ3RoID0gcmVtYWluaW5nXG4gICAgfVxuICB9XG5cbiAgLy8gbXVzdCBiZSBhbiBldmVuIG51bWJlciBvZiBkaWdpdHNcbiAgdmFyIHN0ckxlbiA9IHN0cmluZy5sZW5ndGhcbiAgaWYgKHN0ckxlbiAlIDIgIT09IDApIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBoZXggc3RyaW5nJylcblxuICBpZiAobGVuZ3RoID4gc3RyTGVuIC8gMikge1xuICAgIGxlbmd0aCA9IHN0ckxlbiAvIDJcbiAgfVxuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIHBhcnNlZCA9IHBhcnNlSW50KHN0cmluZy5zdWJzdHIoaSAqIDIsIDIpLCAxNilcbiAgICBpZiAoaXNOYU4ocGFyc2VkKSkgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGhleCBzdHJpbmcnKVxuICAgIGJ1ZltvZmZzZXQgKyBpXSA9IHBhcnNlZFxuICB9XG4gIHJldHVybiBpXG59XG5cbmZ1bmN0aW9uIHV0ZjhXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHJldHVybiBibGl0QnVmZmVyKHV0ZjhUb0J5dGVzKHN0cmluZywgYnVmLmxlbmd0aCAtIG9mZnNldCksIGJ1Ziwgb2Zmc2V0LCBsZW5ndGgpXG59XG5cbmZ1bmN0aW9uIGFzY2lpV3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICByZXR1cm4gYmxpdEJ1ZmZlcihhc2NpaVRvQnl0ZXMoc3RyaW5nKSwgYnVmLCBvZmZzZXQsIGxlbmd0aClcbn1cblxuZnVuY3Rpb24gYmluYXJ5V3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICByZXR1cm4gYXNjaWlXcml0ZShidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG59XG5cbmZ1bmN0aW9uIGJhc2U2NFdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgcmV0dXJuIGJsaXRCdWZmZXIoYmFzZTY0VG9CeXRlcyhzdHJpbmcpLCBidWYsIG9mZnNldCwgbGVuZ3RoKVxufVxuXG5mdW5jdGlvbiB1Y3MyV3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICByZXR1cm4gYmxpdEJ1ZmZlcih1dGYxNmxlVG9CeXRlcyhzdHJpbmcsIGJ1Zi5sZW5ndGggLSBvZmZzZXQpLCBidWYsIG9mZnNldCwgbGVuZ3RoKVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlID0gZnVuY3Rpb24gd3JpdGUgKHN0cmluZywgb2Zmc2V0LCBsZW5ndGgsIGVuY29kaW5nKSB7XG4gIC8vIEJ1ZmZlciN3cml0ZShzdHJpbmcpXG4gIGlmIChvZmZzZXQgPT09IHVuZGVmaW5lZCkge1xuICAgIGVuY29kaW5nID0gJ3V0ZjgnXG4gICAgbGVuZ3RoID0gdGhpcy5sZW5ndGhcbiAgICBvZmZzZXQgPSAwXG4gIC8vIEJ1ZmZlciN3cml0ZShzdHJpbmcsIGVuY29kaW5nKVxuICB9IGVsc2UgaWYgKGxlbmd0aCA9PT0gdW5kZWZpbmVkICYmIHR5cGVvZiBvZmZzZXQgPT09ICdzdHJpbmcnKSB7XG4gICAgZW5jb2RpbmcgPSBvZmZzZXRcbiAgICBsZW5ndGggPSB0aGlzLmxlbmd0aFxuICAgIG9mZnNldCA9IDBcbiAgLy8gQnVmZmVyI3dyaXRlKHN0cmluZywgb2Zmc2V0WywgbGVuZ3RoXVssIGVuY29kaW5nXSlcbiAgfSBlbHNlIGlmIChpc0Zpbml0ZShvZmZzZXQpKSB7XG4gICAgb2Zmc2V0ID0gb2Zmc2V0IHwgMFxuICAgIGlmIChpc0Zpbml0ZShsZW5ndGgpKSB7XG4gICAgICBsZW5ndGggPSBsZW5ndGggfCAwXG4gICAgICBpZiAoZW5jb2RpbmcgPT09IHVuZGVmaW5lZCkgZW5jb2RpbmcgPSAndXRmOCdcbiAgICB9IGVsc2Uge1xuICAgICAgZW5jb2RpbmcgPSBsZW5ndGhcbiAgICAgIGxlbmd0aCA9IHVuZGVmaW5lZFxuICAgIH1cbiAgLy8gbGVnYWN5IHdyaXRlKHN0cmluZywgZW5jb2RpbmcsIG9mZnNldCwgbGVuZ3RoKSAtIHJlbW92ZSBpbiB2MC4xM1xuICB9IGVsc2Uge1xuICAgIHZhciBzd2FwID0gZW5jb2RpbmdcbiAgICBlbmNvZGluZyA9IG9mZnNldFxuICAgIG9mZnNldCA9IGxlbmd0aCB8IDBcbiAgICBsZW5ndGggPSBzd2FwXG4gIH1cblxuICB2YXIgcmVtYWluaW5nID0gdGhpcy5sZW5ndGggLSBvZmZzZXRcbiAgaWYgKGxlbmd0aCA9PT0gdW5kZWZpbmVkIHx8IGxlbmd0aCA+IHJlbWFpbmluZykgbGVuZ3RoID0gcmVtYWluaW5nXG5cbiAgaWYgKChzdHJpbmcubGVuZ3RoID4gMCAmJiAobGVuZ3RoIDwgMCB8fCBvZmZzZXQgPCAwKSkgfHwgb2Zmc2V0ID4gdGhpcy5sZW5ndGgpIHtcbiAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcignYXR0ZW1wdCB0byB3cml0ZSBvdXRzaWRlIGJ1ZmZlciBib3VuZHMnKVxuICB9XG5cbiAgaWYgKCFlbmNvZGluZykgZW5jb2RpbmcgPSAndXRmOCdcblxuICB2YXIgbG93ZXJlZENhc2UgPSBmYWxzZVxuICBmb3IgKDs7KSB7XG4gICAgc3dpdGNoIChlbmNvZGluZykge1xuICAgICAgY2FzZSAnaGV4JzpcbiAgICAgICAgcmV0dXJuIGhleFdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG5cbiAgICAgIGNhc2UgJ3V0ZjgnOlxuICAgICAgY2FzZSAndXRmLTgnOlxuICAgICAgICByZXR1cm4gdXRmOFdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG5cbiAgICAgIGNhc2UgJ2FzY2lpJzpcbiAgICAgICAgcmV0dXJuIGFzY2lpV3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcblxuICAgICAgY2FzZSAnYmluYXJ5JzpcbiAgICAgICAgcmV0dXJuIGJpbmFyeVdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG5cbiAgICAgIGNhc2UgJ2Jhc2U2NCc6XG4gICAgICAgIC8vIFdhcm5pbmc6IG1heExlbmd0aCBub3QgdGFrZW4gaW50byBhY2NvdW50IGluIGJhc2U2NFdyaXRlXG4gICAgICAgIHJldHVybiBiYXNlNjRXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuXG4gICAgICBjYXNlICd1Y3MyJzpcbiAgICAgIGNhc2UgJ3Vjcy0yJzpcbiAgICAgIGNhc2UgJ3V0ZjE2bGUnOlxuICAgICAgY2FzZSAndXRmLTE2bGUnOlxuICAgICAgICByZXR1cm4gdWNzMldyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG5cbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIGlmIChsb3dlcmVkQ2FzZSkgdGhyb3cgbmV3IFR5cGVFcnJvcignVW5rbm93biBlbmNvZGluZzogJyArIGVuY29kaW5nKVxuICAgICAgICBlbmNvZGluZyA9ICgnJyArIGVuY29kaW5nKS50b0xvd2VyQ2FzZSgpXG4gICAgICAgIGxvd2VyZWRDYXNlID0gdHJ1ZVxuICAgIH1cbiAgfVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uIHRvSlNPTiAoKSB7XG4gIHJldHVybiB7XG4gICAgdHlwZTogJ0J1ZmZlcicsXG4gICAgZGF0YTogQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwodGhpcy5fYXJyIHx8IHRoaXMsIDApXG4gIH1cbn1cblxuZnVuY3Rpb24gYmFzZTY0U2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICBpZiAoc3RhcnQgPT09IDAgJiYgZW5kID09PSBidWYubGVuZ3RoKSB7XG4gICAgcmV0dXJuIGJhc2U2NC5mcm9tQnl0ZUFycmF5KGJ1ZilcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gYmFzZTY0LmZyb21CeXRlQXJyYXkoYnVmLnNsaWNlKHN0YXJ0LCBlbmQpKVxuICB9XG59XG5cbmZ1bmN0aW9uIHV0ZjhTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIGVuZCA9IE1hdGgubWluKGJ1Zi5sZW5ndGgsIGVuZClcbiAgdmFyIHJlcyA9IFtdXG5cbiAgdmFyIGkgPSBzdGFydFxuICB3aGlsZSAoaSA8IGVuZCkge1xuICAgIHZhciBmaXJzdEJ5dGUgPSBidWZbaV1cbiAgICB2YXIgY29kZVBvaW50ID0gbnVsbFxuICAgIHZhciBieXRlc1BlclNlcXVlbmNlID0gKGZpcnN0Qnl0ZSA+IDB4RUYpID8gNFxuICAgICAgOiAoZmlyc3RCeXRlID4gMHhERikgPyAzXG4gICAgICA6IChmaXJzdEJ5dGUgPiAweEJGKSA/IDJcbiAgICAgIDogMVxuXG4gICAgaWYgKGkgKyBieXRlc1BlclNlcXVlbmNlIDw9IGVuZCkge1xuICAgICAgdmFyIHNlY29uZEJ5dGUsIHRoaXJkQnl0ZSwgZm91cnRoQnl0ZSwgdGVtcENvZGVQb2ludFxuXG4gICAgICBzd2l0Y2ggKGJ5dGVzUGVyU2VxdWVuY2UpIHtcbiAgICAgICAgY2FzZSAxOlxuICAgICAgICAgIGlmIChmaXJzdEJ5dGUgPCAweDgwKSB7XG4gICAgICAgICAgICBjb2RlUG9pbnQgPSBmaXJzdEJ5dGVcbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgY2FzZSAyOlxuICAgICAgICAgIHNlY29uZEJ5dGUgPSBidWZbaSArIDFdXG4gICAgICAgICAgaWYgKChzZWNvbmRCeXRlICYgMHhDMCkgPT09IDB4ODApIHtcbiAgICAgICAgICAgIHRlbXBDb2RlUG9pbnQgPSAoZmlyc3RCeXRlICYgMHgxRikgPDwgMHg2IHwgKHNlY29uZEJ5dGUgJiAweDNGKVxuICAgICAgICAgICAgaWYgKHRlbXBDb2RlUG9pbnQgPiAweDdGKSB7XG4gICAgICAgICAgICAgIGNvZGVQb2ludCA9IHRlbXBDb2RlUG9pbnRcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgY2FzZSAzOlxuICAgICAgICAgIHNlY29uZEJ5dGUgPSBidWZbaSArIDFdXG4gICAgICAgICAgdGhpcmRCeXRlID0gYnVmW2kgKyAyXVxuICAgICAgICAgIGlmICgoc2Vjb25kQnl0ZSAmIDB4QzApID09PSAweDgwICYmICh0aGlyZEJ5dGUgJiAweEMwKSA9PT0gMHg4MCkge1xuICAgICAgICAgICAgdGVtcENvZGVQb2ludCA9IChmaXJzdEJ5dGUgJiAweEYpIDw8IDB4QyB8IChzZWNvbmRCeXRlICYgMHgzRikgPDwgMHg2IHwgKHRoaXJkQnl0ZSAmIDB4M0YpXG4gICAgICAgICAgICBpZiAodGVtcENvZGVQb2ludCA+IDB4N0ZGICYmICh0ZW1wQ29kZVBvaW50IDwgMHhEODAwIHx8IHRlbXBDb2RlUG9pbnQgPiAweERGRkYpKSB7XG4gICAgICAgICAgICAgIGNvZGVQb2ludCA9IHRlbXBDb2RlUG9pbnRcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgY2FzZSA0OlxuICAgICAgICAgIHNlY29uZEJ5dGUgPSBidWZbaSArIDFdXG4gICAgICAgICAgdGhpcmRCeXRlID0gYnVmW2kgKyAyXVxuICAgICAgICAgIGZvdXJ0aEJ5dGUgPSBidWZbaSArIDNdXG4gICAgICAgICAgaWYgKChzZWNvbmRCeXRlICYgMHhDMCkgPT09IDB4ODAgJiYgKHRoaXJkQnl0ZSAmIDB4QzApID09PSAweDgwICYmIChmb3VydGhCeXRlICYgMHhDMCkgPT09IDB4ODApIHtcbiAgICAgICAgICAgIHRlbXBDb2RlUG9pbnQgPSAoZmlyc3RCeXRlICYgMHhGKSA8PCAweDEyIHwgKHNlY29uZEJ5dGUgJiAweDNGKSA8PCAweEMgfCAodGhpcmRCeXRlICYgMHgzRikgPDwgMHg2IHwgKGZvdXJ0aEJ5dGUgJiAweDNGKVxuICAgICAgICAgICAgaWYgKHRlbXBDb2RlUG9pbnQgPiAweEZGRkYgJiYgdGVtcENvZGVQb2ludCA8IDB4MTEwMDAwKSB7XG4gICAgICAgICAgICAgIGNvZGVQb2ludCA9IHRlbXBDb2RlUG9pbnRcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGNvZGVQb2ludCA9PT0gbnVsbCkge1xuICAgICAgLy8gd2UgZGlkIG5vdCBnZW5lcmF0ZSBhIHZhbGlkIGNvZGVQb2ludCBzbyBpbnNlcnQgYVxuICAgICAgLy8gcmVwbGFjZW1lbnQgY2hhciAoVStGRkZEKSBhbmQgYWR2YW5jZSBvbmx5IDEgYnl0ZVxuICAgICAgY29kZVBvaW50ID0gMHhGRkZEXG4gICAgICBieXRlc1BlclNlcXVlbmNlID0gMVxuICAgIH0gZWxzZSBpZiAoY29kZVBvaW50ID4gMHhGRkZGKSB7XG4gICAgICAvLyBlbmNvZGUgdG8gdXRmMTYgKHN1cnJvZ2F0ZSBwYWlyIGRhbmNlKVxuICAgICAgY29kZVBvaW50IC09IDB4MTAwMDBcbiAgICAgIHJlcy5wdXNoKGNvZGVQb2ludCA+Pj4gMTAgJiAweDNGRiB8IDB4RDgwMClcbiAgICAgIGNvZGVQb2ludCA9IDB4REMwMCB8IGNvZGVQb2ludCAmIDB4M0ZGXG4gICAgfVxuXG4gICAgcmVzLnB1c2goY29kZVBvaW50KVxuICAgIGkgKz0gYnl0ZXNQZXJTZXF1ZW5jZVxuICB9XG5cbiAgcmV0dXJuIGRlY29kZUNvZGVQb2ludHNBcnJheShyZXMpXG59XG5cbi8vIEJhc2VkIG9uIGh0dHA6Ly9zdGFja292ZXJmbG93LmNvbS9hLzIyNzQ3MjcyLzY4MDc0MiwgdGhlIGJyb3dzZXIgd2l0aFxuLy8gdGhlIGxvd2VzdCBsaW1pdCBpcyBDaHJvbWUsIHdpdGggMHgxMDAwMCBhcmdzLlxuLy8gV2UgZ28gMSBtYWduaXR1ZGUgbGVzcywgZm9yIHNhZmV0eVxudmFyIE1BWF9BUkdVTUVOVFNfTEVOR1RIID0gMHgxMDAwXG5cbmZ1bmN0aW9uIGRlY29kZUNvZGVQb2ludHNBcnJheSAoY29kZVBvaW50cykge1xuICB2YXIgbGVuID0gY29kZVBvaW50cy5sZW5ndGhcbiAgaWYgKGxlbiA8PSBNQVhfQVJHVU1FTlRTX0xFTkdUSCkge1xuICAgIHJldHVybiBTdHJpbmcuZnJvbUNoYXJDb2RlLmFwcGx5KFN0cmluZywgY29kZVBvaW50cykgLy8gYXZvaWQgZXh0cmEgc2xpY2UoKVxuICB9XG5cbiAgLy8gRGVjb2RlIGluIGNodW5rcyB0byBhdm9pZCBcImNhbGwgc3RhY2sgc2l6ZSBleGNlZWRlZFwiLlxuICB2YXIgcmVzID0gJydcbiAgdmFyIGkgPSAwXG4gIHdoaWxlIChpIDwgbGVuKSB7XG4gICAgcmVzICs9IFN0cmluZy5mcm9tQ2hhckNvZGUuYXBwbHkoXG4gICAgICBTdHJpbmcsXG4gICAgICBjb2RlUG9pbnRzLnNsaWNlKGksIGkgKz0gTUFYX0FSR1VNRU5UU19MRU5HVEgpXG4gICAgKVxuICB9XG4gIHJldHVybiByZXNcbn1cblxuZnVuY3Rpb24gYXNjaWlTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIHZhciByZXQgPSAnJ1xuICBlbmQgPSBNYXRoLm1pbihidWYubGVuZ3RoLCBlbmQpXG5cbiAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspIHtcbiAgICByZXQgKz0gU3RyaW5nLmZyb21DaGFyQ29kZShidWZbaV0gJiAweDdGKVxuICB9XG4gIHJldHVybiByZXRcbn1cblxuZnVuY3Rpb24gYmluYXJ5U2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICB2YXIgcmV0ID0gJydcbiAgZW5kID0gTWF0aC5taW4oYnVmLmxlbmd0aCwgZW5kKVxuXG4gIGZvciAodmFyIGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKSB7XG4gICAgcmV0ICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoYnVmW2ldKVxuICB9XG4gIHJldHVybiByZXRcbn1cblxuZnVuY3Rpb24gaGV4U2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuXG4gIGlmICghc3RhcnQgfHwgc3RhcnQgPCAwKSBzdGFydCA9IDBcbiAgaWYgKCFlbmQgfHwgZW5kIDwgMCB8fCBlbmQgPiBsZW4pIGVuZCA9IGxlblxuXG4gIHZhciBvdXQgPSAnJ1xuICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPCBlbmQ7IGkrKykge1xuICAgIG91dCArPSB0b0hleChidWZbaV0pXG4gIH1cbiAgcmV0dXJuIG91dFxufVxuXG5mdW5jdGlvbiB1dGYxNmxlU2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICB2YXIgYnl0ZXMgPSBidWYuc2xpY2Uoc3RhcnQsIGVuZClcbiAgdmFyIHJlcyA9ICcnXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgYnl0ZXMubGVuZ3RoOyBpICs9IDIpIHtcbiAgICByZXMgKz0gU3RyaW5nLmZyb21DaGFyQ29kZShieXRlc1tpXSArIGJ5dGVzW2kgKyAxXSAqIDI1NilcbiAgfVxuICByZXR1cm4gcmVzXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUuc2xpY2UgPSBmdW5jdGlvbiBzbGljZSAoc3RhcnQsIGVuZCkge1xuICB2YXIgbGVuID0gdGhpcy5sZW5ndGhcbiAgc3RhcnQgPSB+fnN0YXJ0XG4gIGVuZCA9IGVuZCA9PT0gdW5kZWZpbmVkID8gbGVuIDogfn5lbmRcblxuICBpZiAoc3RhcnQgPCAwKSB7XG4gICAgc3RhcnQgKz0gbGVuXG4gICAgaWYgKHN0YXJ0IDwgMCkgc3RhcnQgPSAwXG4gIH0gZWxzZSBpZiAoc3RhcnQgPiBsZW4pIHtcbiAgICBzdGFydCA9IGxlblxuICB9XG5cbiAgaWYgKGVuZCA8IDApIHtcbiAgICBlbmQgKz0gbGVuXG4gICAgaWYgKGVuZCA8IDApIGVuZCA9IDBcbiAgfSBlbHNlIGlmIChlbmQgPiBsZW4pIHtcbiAgICBlbmQgPSBsZW5cbiAgfVxuXG4gIGlmIChlbmQgPCBzdGFydCkgZW5kID0gc3RhcnRcblxuICB2YXIgbmV3QnVmXG4gIGlmIChCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkge1xuICAgIG5ld0J1ZiA9IEJ1ZmZlci5fYXVnbWVudCh0aGlzLnN1YmFycmF5KHN0YXJ0LCBlbmQpKVxuICB9IGVsc2Uge1xuICAgIHZhciBzbGljZUxlbiA9IGVuZCAtIHN0YXJ0XG4gICAgbmV3QnVmID0gbmV3IEJ1ZmZlcihzbGljZUxlbiwgdW5kZWZpbmVkKVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgc2xpY2VMZW47IGkrKykge1xuICAgICAgbmV3QnVmW2ldID0gdGhpc1tpICsgc3RhcnRdXG4gICAgfVxuICB9XG5cbiAgaWYgKG5ld0J1Zi5sZW5ndGgpIG5ld0J1Zi5wYXJlbnQgPSB0aGlzLnBhcmVudCB8fCB0aGlzXG5cbiAgcmV0dXJuIG5ld0J1ZlxufVxuXG4vKlxuICogTmVlZCB0byBtYWtlIHN1cmUgdGhhdCBidWZmZXIgaXNuJ3QgdHJ5aW5nIHRvIHdyaXRlIG91dCBvZiBib3VuZHMuXG4gKi9cbmZ1bmN0aW9uIGNoZWNrT2Zmc2V0IChvZmZzZXQsIGV4dCwgbGVuZ3RoKSB7XG4gIGlmICgob2Zmc2V0ICUgMSkgIT09IDAgfHwgb2Zmc2V0IDwgMCkgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ29mZnNldCBpcyBub3QgdWludCcpXG4gIGlmIChvZmZzZXQgKyBleHQgPiBsZW5ndGgpIHRocm93IG5ldyBSYW5nZUVycm9yKCdUcnlpbmcgdG8gYWNjZXNzIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludExFID0gZnVuY3Rpb24gcmVhZFVJbnRMRSAob2Zmc2V0LCBieXRlTGVuZ3RoLCBub0Fzc2VydCkge1xuICBvZmZzZXQgPSBvZmZzZXQgfCAwXG4gIGJ5dGVMZW5ndGggPSBieXRlTGVuZ3RoIHwgMFxuICBpZiAoIW5vQXNzZXJ0KSBjaGVja09mZnNldChvZmZzZXQsIGJ5dGVMZW5ndGgsIHRoaXMubGVuZ3RoKVxuXG4gIHZhciB2YWwgPSB0aGlzW29mZnNldF1cbiAgdmFyIG11bCA9IDFcbiAgdmFyIGkgPSAwXG4gIHdoaWxlICgrK2kgPCBieXRlTGVuZ3RoICYmIChtdWwgKj0gMHgxMDApKSB7XG4gICAgdmFsICs9IHRoaXNbb2Zmc2V0ICsgaV0gKiBtdWxcbiAgfVxuXG4gIHJldHVybiB2YWxcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludEJFID0gZnVuY3Rpb24gcmVhZFVJbnRCRSAob2Zmc2V0LCBieXRlTGVuZ3RoLCBub0Fzc2VydCkge1xuICBvZmZzZXQgPSBvZmZzZXQgfCAwXG4gIGJ5dGVMZW5ndGggPSBieXRlTGVuZ3RoIHwgMFxuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgY2hlY2tPZmZzZXQob2Zmc2V0LCBieXRlTGVuZ3RoLCB0aGlzLmxlbmd0aClcbiAgfVxuXG4gIHZhciB2YWwgPSB0aGlzW29mZnNldCArIC0tYnl0ZUxlbmd0aF1cbiAgdmFyIG11bCA9IDFcbiAgd2hpbGUgKGJ5dGVMZW5ndGggPiAwICYmIChtdWwgKj0gMHgxMDApKSB7XG4gICAgdmFsICs9IHRoaXNbb2Zmc2V0ICsgLS1ieXRlTGVuZ3RoXSAqIG11bFxuICB9XG5cbiAgcmV0dXJuIHZhbFxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50OCA9IGZ1bmN0aW9uIHJlYWRVSW50OCAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSBjaGVja09mZnNldChvZmZzZXQsIDEsIHRoaXMubGVuZ3RoKVxuICByZXR1cm4gdGhpc1tvZmZzZXRdXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnQxNkxFID0gZnVuY3Rpb24gcmVhZFVJbnQxNkxFIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIGNoZWNrT2Zmc2V0KG9mZnNldCwgMiwgdGhpcy5sZW5ndGgpXG4gIHJldHVybiB0aGlzW29mZnNldF0gfCAodGhpc1tvZmZzZXQgKyAxXSA8PCA4KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50MTZCRSA9IGZ1bmN0aW9uIHJlYWRVSW50MTZCRSAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSBjaGVja09mZnNldChvZmZzZXQsIDIsIHRoaXMubGVuZ3RoKVxuICByZXR1cm4gKHRoaXNbb2Zmc2V0XSA8PCA4KSB8IHRoaXNbb2Zmc2V0ICsgMV1cbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDMyTEUgPSBmdW5jdGlvbiByZWFkVUludDMyTEUgKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkgY2hlY2tPZmZzZXQob2Zmc2V0LCA0LCB0aGlzLmxlbmd0aClcblxuICByZXR1cm4gKCh0aGlzW29mZnNldF0pIHxcbiAgICAgICh0aGlzW29mZnNldCArIDFdIDw8IDgpIHxcbiAgICAgICh0aGlzW29mZnNldCArIDJdIDw8IDE2KSkgK1xuICAgICAgKHRoaXNbb2Zmc2V0ICsgM10gKiAweDEwMDAwMDApXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnQzMkJFID0gZnVuY3Rpb24gcmVhZFVJbnQzMkJFIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIGNoZWNrT2Zmc2V0KG9mZnNldCwgNCwgdGhpcy5sZW5ndGgpXG5cbiAgcmV0dXJuICh0aGlzW29mZnNldF0gKiAweDEwMDAwMDApICtcbiAgICAoKHRoaXNbb2Zmc2V0ICsgMV0gPDwgMTYpIHxcbiAgICAodGhpc1tvZmZzZXQgKyAyXSA8PCA4KSB8XG4gICAgdGhpc1tvZmZzZXQgKyAzXSlcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50TEUgPSBmdW5jdGlvbiByZWFkSW50TEUgKG9mZnNldCwgYnl0ZUxlbmd0aCwgbm9Bc3NlcnQpIHtcbiAgb2Zmc2V0ID0gb2Zmc2V0IHwgMFxuICBieXRlTGVuZ3RoID0gYnl0ZUxlbmd0aCB8IDBcbiAgaWYgKCFub0Fzc2VydCkgY2hlY2tPZmZzZXQob2Zmc2V0LCBieXRlTGVuZ3RoLCB0aGlzLmxlbmd0aClcblxuICB2YXIgdmFsID0gdGhpc1tvZmZzZXRdXG4gIHZhciBtdWwgPSAxXG4gIHZhciBpID0gMFxuICB3aGlsZSAoKytpIDwgYnl0ZUxlbmd0aCAmJiAobXVsICo9IDB4MTAwKSkge1xuICAgIHZhbCArPSB0aGlzW29mZnNldCArIGldICogbXVsXG4gIH1cbiAgbXVsICo9IDB4ODBcblxuICBpZiAodmFsID49IG11bCkgdmFsIC09IE1hdGgucG93KDIsIDggKiBieXRlTGVuZ3RoKVxuXG4gIHJldHVybiB2YWxcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50QkUgPSBmdW5jdGlvbiByZWFkSW50QkUgKG9mZnNldCwgYnl0ZUxlbmd0aCwgbm9Bc3NlcnQpIHtcbiAgb2Zmc2V0ID0gb2Zmc2V0IHwgMFxuICBieXRlTGVuZ3RoID0gYnl0ZUxlbmd0aCB8IDBcbiAgaWYgKCFub0Fzc2VydCkgY2hlY2tPZmZzZXQob2Zmc2V0LCBieXRlTGVuZ3RoLCB0aGlzLmxlbmd0aClcblxuICB2YXIgaSA9IGJ5dGVMZW5ndGhcbiAgdmFyIG11bCA9IDFcbiAgdmFyIHZhbCA9IHRoaXNbb2Zmc2V0ICsgLS1pXVxuICB3aGlsZSAoaSA+IDAgJiYgKG11bCAqPSAweDEwMCkpIHtcbiAgICB2YWwgKz0gdGhpc1tvZmZzZXQgKyAtLWldICogbXVsXG4gIH1cbiAgbXVsICo9IDB4ODBcblxuICBpZiAodmFsID49IG11bCkgdmFsIC09IE1hdGgucG93KDIsIDggKiBieXRlTGVuZ3RoKVxuXG4gIHJldHVybiB2YWxcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50OCA9IGZ1bmN0aW9uIHJlYWRJbnQ4IChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIGNoZWNrT2Zmc2V0KG9mZnNldCwgMSwgdGhpcy5sZW5ndGgpXG4gIGlmICghKHRoaXNbb2Zmc2V0XSAmIDB4ODApKSByZXR1cm4gKHRoaXNbb2Zmc2V0XSlcbiAgcmV0dXJuICgoMHhmZiAtIHRoaXNbb2Zmc2V0XSArIDEpICogLTEpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDE2TEUgPSBmdW5jdGlvbiByZWFkSW50MTZMRSAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSBjaGVja09mZnNldChvZmZzZXQsIDIsIHRoaXMubGVuZ3RoKVxuICB2YXIgdmFsID0gdGhpc1tvZmZzZXRdIHwgKHRoaXNbb2Zmc2V0ICsgMV0gPDwgOClcbiAgcmV0dXJuICh2YWwgJiAweDgwMDApID8gdmFsIHwgMHhGRkZGMDAwMCA6IHZhbFxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRJbnQxNkJFID0gZnVuY3Rpb24gcmVhZEludDE2QkUgKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkgY2hlY2tPZmZzZXQob2Zmc2V0LCAyLCB0aGlzLmxlbmd0aClcbiAgdmFyIHZhbCA9IHRoaXNbb2Zmc2V0ICsgMV0gfCAodGhpc1tvZmZzZXRdIDw8IDgpXG4gIHJldHVybiAodmFsICYgMHg4MDAwKSA/IHZhbCB8IDB4RkZGRjAwMDAgOiB2YWxcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50MzJMRSA9IGZ1bmN0aW9uIHJlYWRJbnQzMkxFIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIGNoZWNrT2Zmc2V0KG9mZnNldCwgNCwgdGhpcy5sZW5ndGgpXG5cbiAgcmV0dXJuICh0aGlzW29mZnNldF0pIHxcbiAgICAodGhpc1tvZmZzZXQgKyAxXSA8PCA4KSB8XG4gICAgKHRoaXNbb2Zmc2V0ICsgMl0gPDwgMTYpIHxcbiAgICAodGhpc1tvZmZzZXQgKyAzXSA8PCAyNClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50MzJCRSA9IGZ1bmN0aW9uIHJlYWRJbnQzMkJFIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIGNoZWNrT2Zmc2V0KG9mZnNldCwgNCwgdGhpcy5sZW5ndGgpXG5cbiAgcmV0dXJuICh0aGlzW29mZnNldF0gPDwgMjQpIHxcbiAgICAodGhpc1tvZmZzZXQgKyAxXSA8PCAxNikgfFxuICAgICh0aGlzW29mZnNldCArIDJdIDw8IDgpIHxcbiAgICAodGhpc1tvZmZzZXQgKyAzXSlcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkRmxvYXRMRSA9IGZ1bmN0aW9uIHJlYWRGbG9hdExFIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIGNoZWNrT2Zmc2V0KG9mZnNldCwgNCwgdGhpcy5sZW5ndGgpXG4gIHJldHVybiBpZWVlNzU0LnJlYWQodGhpcywgb2Zmc2V0LCB0cnVlLCAyMywgNClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkRmxvYXRCRSA9IGZ1bmN0aW9uIHJlYWRGbG9hdEJFIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIGNoZWNrT2Zmc2V0KG9mZnNldCwgNCwgdGhpcy5sZW5ndGgpXG4gIHJldHVybiBpZWVlNzU0LnJlYWQodGhpcywgb2Zmc2V0LCBmYWxzZSwgMjMsIDQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZERvdWJsZUxFID0gZnVuY3Rpb24gcmVhZERvdWJsZUxFIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIGNoZWNrT2Zmc2V0KG9mZnNldCwgOCwgdGhpcy5sZW5ndGgpXG4gIHJldHVybiBpZWVlNzU0LnJlYWQodGhpcywgb2Zmc2V0LCB0cnVlLCA1MiwgOClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkRG91YmxlQkUgPSBmdW5jdGlvbiByZWFkRG91YmxlQkUgKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkgY2hlY2tPZmZzZXQob2Zmc2V0LCA4LCB0aGlzLmxlbmd0aClcbiAgcmV0dXJuIGllZWU3NTQucmVhZCh0aGlzLCBvZmZzZXQsIGZhbHNlLCA1MiwgOClcbn1cblxuZnVuY3Rpb24gY2hlY2tJbnQgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgZXh0LCBtYXgsIG1pbikge1xuICBpZiAoIUJ1ZmZlci5pc0J1ZmZlcihidWYpKSB0aHJvdyBuZXcgVHlwZUVycm9yKCdidWZmZXIgbXVzdCBiZSBhIEJ1ZmZlciBpbnN0YW5jZScpXG4gIGlmICh2YWx1ZSA+IG1heCB8fCB2YWx1ZSA8IG1pbikgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ3ZhbHVlIGlzIG91dCBvZiBib3VuZHMnKVxuICBpZiAob2Zmc2V0ICsgZXh0ID4gYnVmLmxlbmd0aCkgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ2luZGV4IG91dCBvZiByYW5nZScpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50TEUgPSBmdW5jdGlvbiB3cml0ZVVJbnRMRSAodmFsdWUsIG9mZnNldCwgYnl0ZUxlbmd0aCwgbm9Bc3NlcnQpIHtcbiAgdmFsdWUgPSArdmFsdWVcbiAgb2Zmc2V0ID0gb2Zmc2V0IHwgMFxuICBieXRlTGVuZ3RoID0gYnl0ZUxlbmd0aCB8IDBcbiAgaWYgKCFub0Fzc2VydCkgY2hlY2tJbnQodGhpcywgdmFsdWUsIG9mZnNldCwgYnl0ZUxlbmd0aCwgTWF0aC5wb3coMiwgOCAqIGJ5dGVMZW5ndGgpLCAwKVxuXG4gIHZhciBtdWwgPSAxXG4gIHZhciBpID0gMFxuICB0aGlzW29mZnNldF0gPSB2YWx1ZSAmIDB4RkZcbiAgd2hpbGUgKCsraSA8IGJ5dGVMZW5ndGggJiYgKG11bCAqPSAweDEwMCkpIHtcbiAgICB0aGlzW29mZnNldCArIGldID0gKHZhbHVlIC8gbXVsKSAmIDB4RkZcbiAgfVxuXG4gIHJldHVybiBvZmZzZXQgKyBieXRlTGVuZ3RoXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50QkUgPSBmdW5jdGlvbiB3cml0ZVVJbnRCRSAodmFsdWUsIG9mZnNldCwgYnl0ZUxlbmd0aCwgbm9Bc3NlcnQpIHtcbiAgdmFsdWUgPSArdmFsdWVcbiAgb2Zmc2V0ID0gb2Zmc2V0IHwgMFxuICBieXRlTGVuZ3RoID0gYnl0ZUxlbmd0aCB8IDBcbiAgaWYgKCFub0Fzc2VydCkgY2hlY2tJbnQodGhpcywgdmFsdWUsIG9mZnNldCwgYnl0ZUxlbmd0aCwgTWF0aC5wb3coMiwgOCAqIGJ5dGVMZW5ndGgpLCAwKVxuXG4gIHZhciBpID0gYnl0ZUxlbmd0aCAtIDFcbiAgdmFyIG11bCA9IDFcbiAgdGhpc1tvZmZzZXQgKyBpXSA9IHZhbHVlICYgMHhGRlxuICB3aGlsZSAoLS1pID49IDAgJiYgKG11bCAqPSAweDEwMCkpIHtcbiAgICB0aGlzW29mZnNldCArIGldID0gKHZhbHVlIC8gbXVsKSAmIDB4RkZcbiAgfVxuXG4gIHJldHVybiBvZmZzZXQgKyBieXRlTGVuZ3RoXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50OCA9IGZ1bmN0aW9uIHdyaXRlVUludDggKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHZhbHVlID0gK3ZhbHVlXG4gIG9mZnNldCA9IG9mZnNldCB8IDBcbiAgaWYgKCFub0Fzc2VydCkgY2hlY2tJbnQodGhpcywgdmFsdWUsIG9mZnNldCwgMSwgMHhmZiwgMClcbiAgaWYgKCFCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkgdmFsdWUgPSBNYXRoLmZsb29yKHZhbHVlKVxuICB0aGlzW29mZnNldF0gPSAodmFsdWUgJiAweGZmKVxuICByZXR1cm4gb2Zmc2V0ICsgMVxufVxuXG5mdW5jdGlvbiBvYmplY3RXcml0ZVVJbnQxNiAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4pIHtcbiAgaWYgKHZhbHVlIDwgMCkgdmFsdWUgPSAweGZmZmYgKyB2YWx1ZSArIDFcbiAgZm9yICh2YXIgaSA9IDAsIGogPSBNYXRoLm1pbihidWYubGVuZ3RoIC0gb2Zmc2V0LCAyKTsgaSA8IGo7IGkrKykge1xuICAgIGJ1ZltvZmZzZXQgKyBpXSA9ICh2YWx1ZSAmICgweGZmIDw8ICg4ICogKGxpdHRsZUVuZGlhbiA/IGkgOiAxIC0gaSkpKSkgPj4+XG4gICAgICAobGl0dGxlRW5kaWFuID8gaSA6IDEgLSBpKSAqIDhcbiAgfVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludDE2TEUgPSBmdW5jdGlvbiB3cml0ZVVJbnQxNkxFICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICB2YWx1ZSA9ICt2YWx1ZVxuICBvZmZzZXQgPSBvZmZzZXQgfCAwXG4gIGlmICghbm9Bc3NlcnQpIGNoZWNrSW50KHRoaXMsIHZhbHVlLCBvZmZzZXQsIDIsIDB4ZmZmZiwgMClcbiAgaWYgKEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUKSB7XG4gICAgdGhpc1tvZmZzZXRdID0gKHZhbHVlICYgMHhmZilcbiAgICB0aGlzW29mZnNldCArIDFdID0gKHZhbHVlID4+PiA4KVxuICB9IGVsc2Uge1xuICAgIG9iamVjdFdyaXRlVUludDE2KHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUpXG4gIH1cbiAgcmV0dXJuIG9mZnNldCArIDJcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQxNkJFID0gZnVuY3Rpb24gd3JpdGVVSW50MTZCRSAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgdmFsdWUgPSArdmFsdWVcbiAgb2Zmc2V0ID0gb2Zmc2V0IHwgMFxuICBpZiAoIW5vQXNzZXJ0KSBjaGVja0ludCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCAyLCAweGZmZmYsIDApXG4gIGlmIChCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkge1xuICAgIHRoaXNbb2Zmc2V0XSA9ICh2YWx1ZSA+Pj4gOClcbiAgICB0aGlzW29mZnNldCArIDFdID0gKHZhbHVlICYgMHhmZilcbiAgfSBlbHNlIHtcbiAgICBvYmplY3RXcml0ZVVJbnQxNih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSlcbiAgfVxuICByZXR1cm4gb2Zmc2V0ICsgMlxufVxuXG5mdW5jdGlvbiBvYmplY3RXcml0ZVVJbnQzMiAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4pIHtcbiAgaWYgKHZhbHVlIDwgMCkgdmFsdWUgPSAweGZmZmZmZmZmICsgdmFsdWUgKyAxXG4gIGZvciAodmFyIGkgPSAwLCBqID0gTWF0aC5taW4oYnVmLmxlbmd0aCAtIG9mZnNldCwgNCk7IGkgPCBqOyBpKyspIHtcbiAgICBidWZbb2Zmc2V0ICsgaV0gPSAodmFsdWUgPj4+IChsaXR0bGVFbmRpYW4gPyBpIDogMyAtIGkpICogOCkgJiAweGZmXG4gIH1cbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQzMkxFID0gZnVuY3Rpb24gd3JpdGVVSW50MzJMRSAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgdmFsdWUgPSArdmFsdWVcbiAgb2Zmc2V0ID0gb2Zmc2V0IHwgMFxuICBpZiAoIW5vQXNzZXJ0KSBjaGVja0ludCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCA0LCAweGZmZmZmZmZmLCAwKVxuICBpZiAoQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHtcbiAgICB0aGlzW29mZnNldCArIDNdID0gKHZhbHVlID4+PiAyNClcbiAgICB0aGlzW29mZnNldCArIDJdID0gKHZhbHVlID4+PiAxNilcbiAgICB0aGlzW29mZnNldCArIDFdID0gKHZhbHVlID4+PiA4KVxuICAgIHRoaXNbb2Zmc2V0XSA9ICh2YWx1ZSAmIDB4ZmYpXG4gIH0gZWxzZSB7XG4gICAgb2JqZWN0V3JpdGVVSW50MzIodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSlcbiAgfVxuICByZXR1cm4gb2Zmc2V0ICsgNFxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludDMyQkUgPSBmdW5jdGlvbiB3cml0ZVVJbnQzMkJFICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICB2YWx1ZSA9ICt2YWx1ZVxuICBvZmZzZXQgPSBvZmZzZXQgfCAwXG4gIGlmICghbm9Bc3NlcnQpIGNoZWNrSW50KHRoaXMsIHZhbHVlLCBvZmZzZXQsIDQsIDB4ZmZmZmZmZmYsIDApXG4gIGlmIChCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkge1xuICAgIHRoaXNbb2Zmc2V0XSA9ICh2YWx1ZSA+Pj4gMjQpXG4gICAgdGhpc1tvZmZzZXQgKyAxXSA9ICh2YWx1ZSA+Pj4gMTYpXG4gICAgdGhpc1tvZmZzZXQgKyAyXSA9ICh2YWx1ZSA+Pj4gOClcbiAgICB0aGlzW29mZnNldCArIDNdID0gKHZhbHVlICYgMHhmZilcbiAgfSBlbHNlIHtcbiAgICBvYmplY3RXcml0ZVVJbnQzMih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSlcbiAgfVxuICByZXR1cm4gb2Zmc2V0ICsgNFxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50TEUgPSBmdW5jdGlvbiB3cml0ZUludExFICh2YWx1ZSwgb2Zmc2V0LCBieXRlTGVuZ3RoLCBub0Fzc2VydCkge1xuICB2YWx1ZSA9ICt2YWx1ZVxuICBvZmZzZXQgPSBvZmZzZXQgfCAwXG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICB2YXIgbGltaXQgPSBNYXRoLnBvdygyLCA4ICogYnl0ZUxlbmd0aCAtIDEpXG5cbiAgICBjaGVja0ludCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBieXRlTGVuZ3RoLCBsaW1pdCAtIDEsIC1saW1pdClcbiAgfVxuXG4gIHZhciBpID0gMFxuICB2YXIgbXVsID0gMVxuICB2YXIgc3ViID0gdmFsdWUgPCAwID8gMSA6IDBcbiAgdGhpc1tvZmZzZXRdID0gdmFsdWUgJiAweEZGXG4gIHdoaWxlICgrK2kgPCBieXRlTGVuZ3RoICYmIChtdWwgKj0gMHgxMDApKSB7XG4gICAgdGhpc1tvZmZzZXQgKyBpXSA9ICgodmFsdWUgLyBtdWwpID4+IDApIC0gc3ViICYgMHhGRlxuICB9XG5cbiAgcmV0dXJuIG9mZnNldCArIGJ5dGVMZW5ndGhcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludEJFID0gZnVuY3Rpb24gd3JpdGVJbnRCRSAodmFsdWUsIG9mZnNldCwgYnl0ZUxlbmd0aCwgbm9Bc3NlcnQpIHtcbiAgdmFsdWUgPSArdmFsdWVcbiAgb2Zmc2V0ID0gb2Zmc2V0IHwgMFxuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgdmFyIGxpbWl0ID0gTWF0aC5wb3coMiwgOCAqIGJ5dGVMZW5ndGggLSAxKVxuXG4gICAgY2hlY2tJbnQodGhpcywgdmFsdWUsIG9mZnNldCwgYnl0ZUxlbmd0aCwgbGltaXQgLSAxLCAtbGltaXQpXG4gIH1cblxuICB2YXIgaSA9IGJ5dGVMZW5ndGggLSAxXG4gIHZhciBtdWwgPSAxXG4gIHZhciBzdWIgPSB2YWx1ZSA8IDAgPyAxIDogMFxuICB0aGlzW29mZnNldCArIGldID0gdmFsdWUgJiAweEZGXG4gIHdoaWxlICgtLWkgPj0gMCAmJiAobXVsICo9IDB4MTAwKSkge1xuICAgIHRoaXNbb2Zmc2V0ICsgaV0gPSAoKHZhbHVlIC8gbXVsKSA+PiAwKSAtIHN1YiAmIDB4RkZcbiAgfVxuXG4gIHJldHVybiBvZmZzZXQgKyBieXRlTGVuZ3RoXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVJbnQ4ID0gZnVuY3Rpb24gd3JpdGVJbnQ4ICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICB2YWx1ZSA9ICt2YWx1ZVxuICBvZmZzZXQgPSBvZmZzZXQgfCAwXG4gIGlmICghbm9Bc3NlcnQpIGNoZWNrSW50KHRoaXMsIHZhbHVlLCBvZmZzZXQsIDEsIDB4N2YsIC0weDgwKVxuICBpZiAoIUJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUKSB2YWx1ZSA9IE1hdGguZmxvb3IodmFsdWUpXG4gIGlmICh2YWx1ZSA8IDApIHZhbHVlID0gMHhmZiArIHZhbHVlICsgMVxuICB0aGlzW29mZnNldF0gPSAodmFsdWUgJiAweGZmKVxuICByZXR1cm4gb2Zmc2V0ICsgMVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50MTZMRSA9IGZ1bmN0aW9uIHdyaXRlSW50MTZMRSAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgdmFsdWUgPSArdmFsdWVcbiAgb2Zmc2V0ID0gb2Zmc2V0IHwgMFxuICBpZiAoIW5vQXNzZXJ0KSBjaGVja0ludCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCAyLCAweDdmZmYsIC0weDgwMDApXG4gIGlmIChCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkge1xuICAgIHRoaXNbb2Zmc2V0XSA9ICh2YWx1ZSAmIDB4ZmYpXG4gICAgdGhpc1tvZmZzZXQgKyAxXSA9ICh2YWx1ZSA+Pj4gOClcbiAgfSBlbHNlIHtcbiAgICBvYmplY3RXcml0ZVVJbnQxNih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlKVxuICB9XG4gIHJldHVybiBvZmZzZXQgKyAyXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVJbnQxNkJFID0gZnVuY3Rpb24gd3JpdGVJbnQxNkJFICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICB2YWx1ZSA9ICt2YWx1ZVxuICBvZmZzZXQgPSBvZmZzZXQgfCAwXG4gIGlmICghbm9Bc3NlcnQpIGNoZWNrSW50KHRoaXMsIHZhbHVlLCBvZmZzZXQsIDIsIDB4N2ZmZiwgLTB4ODAwMClcbiAgaWYgKEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUKSB7XG4gICAgdGhpc1tvZmZzZXRdID0gKHZhbHVlID4+PiA4KVxuICAgIHRoaXNbb2Zmc2V0ICsgMV0gPSAodmFsdWUgJiAweGZmKVxuICB9IGVsc2Uge1xuICAgIG9iamVjdFdyaXRlVUludDE2KHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlKVxuICB9XG4gIHJldHVybiBvZmZzZXQgKyAyXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVJbnQzMkxFID0gZnVuY3Rpb24gd3JpdGVJbnQzMkxFICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICB2YWx1ZSA9ICt2YWx1ZVxuICBvZmZzZXQgPSBvZmZzZXQgfCAwXG4gIGlmICghbm9Bc3NlcnQpIGNoZWNrSW50KHRoaXMsIHZhbHVlLCBvZmZzZXQsIDQsIDB4N2ZmZmZmZmYsIC0weDgwMDAwMDAwKVxuICBpZiAoQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHtcbiAgICB0aGlzW29mZnNldF0gPSAodmFsdWUgJiAweGZmKVxuICAgIHRoaXNbb2Zmc2V0ICsgMV0gPSAodmFsdWUgPj4+IDgpXG4gICAgdGhpc1tvZmZzZXQgKyAyXSA9ICh2YWx1ZSA+Pj4gMTYpXG4gICAgdGhpc1tvZmZzZXQgKyAzXSA9ICh2YWx1ZSA+Pj4gMjQpXG4gIH0gZWxzZSB7XG4gICAgb2JqZWN0V3JpdGVVSW50MzIodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSlcbiAgfVxuICByZXR1cm4gb2Zmc2V0ICsgNFxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50MzJCRSA9IGZ1bmN0aW9uIHdyaXRlSW50MzJCRSAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgdmFsdWUgPSArdmFsdWVcbiAgb2Zmc2V0ID0gb2Zmc2V0IHwgMFxuICBpZiAoIW5vQXNzZXJ0KSBjaGVja0ludCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCA0LCAweDdmZmZmZmZmLCAtMHg4MDAwMDAwMClcbiAgaWYgKHZhbHVlIDwgMCkgdmFsdWUgPSAweGZmZmZmZmZmICsgdmFsdWUgKyAxXG4gIGlmIChCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkge1xuICAgIHRoaXNbb2Zmc2V0XSA9ICh2YWx1ZSA+Pj4gMjQpXG4gICAgdGhpc1tvZmZzZXQgKyAxXSA9ICh2YWx1ZSA+Pj4gMTYpXG4gICAgdGhpc1tvZmZzZXQgKyAyXSA9ICh2YWx1ZSA+Pj4gOClcbiAgICB0aGlzW29mZnNldCArIDNdID0gKHZhbHVlICYgMHhmZilcbiAgfSBlbHNlIHtcbiAgICBvYmplY3RXcml0ZVVJbnQzMih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSlcbiAgfVxuICByZXR1cm4gb2Zmc2V0ICsgNFxufVxuXG5mdW5jdGlvbiBjaGVja0lFRUU3NTQgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgZXh0LCBtYXgsIG1pbikge1xuICBpZiAodmFsdWUgPiBtYXggfHwgdmFsdWUgPCBtaW4pIHRocm93IG5ldyBSYW5nZUVycm9yKCd2YWx1ZSBpcyBvdXQgb2YgYm91bmRzJylcbiAgaWYgKG9mZnNldCArIGV4dCA+IGJ1Zi5sZW5ndGgpIHRocm93IG5ldyBSYW5nZUVycm9yKCdpbmRleCBvdXQgb2YgcmFuZ2UnKVxuICBpZiAob2Zmc2V0IDwgMCkgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ2luZGV4IG91dCBvZiByYW5nZScpXG59XG5cbmZ1bmN0aW9uIHdyaXRlRmxvYXQgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgY2hlY2tJRUVFNzU0KGJ1ZiwgdmFsdWUsIG9mZnNldCwgNCwgMy40MDI4MjM0NjYzODUyODg2ZSszOCwgLTMuNDAyODIzNDY2Mzg1Mjg4NmUrMzgpXG4gIH1cbiAgaWVlZTc1NC53cml0ZShidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgMjMsIDQpXG4gIHJldHVybiBvZmZzZXQgKyA0XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVGbG9hdExFID0gZnVuY3Rpb24gd3JpdGVGbG9hdExFICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gd3JpdGVGbG9hdCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUZsb2F0QkUgPSBmdW5jdGlvbiB3cml0ZUZsb2F0QkUgKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiB3cml0ZUZsb2F0KHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gd3JpdGVEb3VibGUgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgY2hlY2tJRUVFNzU0KGJ1ZiwgdmFsdWUsIG9mZnNldCwgOCwgMS43OTc2OTMxMzQ4NjIzMTU3RSszMDgsIC0xLjc5NzY5MzEzNDg2MjMxNTdFKzMwOClcbiAgfVxuICBpZWVlNzU0LndyaXRlKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCA1MiwgOClcbiAgcmV0dXJuIG9mZnNldCArIDhcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZURvdWJsZUxFID0gZnVuY3Rpb24gd3JpdGVEb3VibGVMRSAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIHdyaXRlRG91YmxlKHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlRG91YmxlQkUgPSBmdW5jdGlvbiB3cml0ZURvdWJsZUJFICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gd3JpdGVEb3VibGUodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG4vLyBjb3B5KHRhcmdldEJ1ZmZlciwgdGFyZ2V0U3RhcnQ9MCwgc291cmNlU3RhcnQ9MCwgc291cmNlRW5kPWJ1ZmZlci5sZW5ndGgpXG5CdWZmZXIucHJvdG90eXBlLmNvcHkgPSBmdW5jdGlvbiBjb3B5ICh0YXJnZXQsIHRhcmdldFN0YXJ0LCBzdGFydCwgZW5kKSB7XG4gIGlmICghc3RhcnQpIHN0YXJ0ID0gMFxuICBpZiAoIWVuZCAmJiBlbmQgIT09IDApIGVuZCA9IHRoaXMubGVuZ3RoXG4gIGlmICh0YXJnZXRTdGFydCA+PSB0YXJnZXQubGVuZ3RoKSB0YXJnZXRTdGFydCA9IHRhcmdldC5sZW5ndGhcbiAgaWYgKCF0YXJnZXRTdGFydCkgdGFyZ2V0U3RhcnQgPSAwXG4gIGlmIChlbmQgPiAwICYmIGVuZCA8IHN0YXJ0KSBlbmQgPSBzdGFydFxuXG4gIC8vIENvcHkgMCBieXRlczsgd2UncmUgZG9uZVxuICBpZiAoZW5kID09PSBzdGFydCkgcmV0dXJuIDBcbiAgaWYgKHRhcmdldC5sZW5ndGggPT09IDAgfHwgdGhpcy5sZW5ndGggPT09IDApIHJldHVybiAwXG5cbiAgLy8gRmF0YWwgZXJyb3IgY29uZGl0aW9uc1xuICBpZiAodGFyZ2V0U3RhcnQgPCAwKSB7XG4gICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ3RhcmdldFN0YXJ0IG91dCBvZiBib3VuZHMnKVxuICB9XG4gIGlmIChzdGFydCA8IDAgfHwgc3RhcnQgPj0gdGhpcy5sZW5ndGgpIHRocm93IG5ldyBSYW5nZUVycm9yKCdzb3VyY2VTdGFydCBvdXQgb2YgYm91bmRzJylcbiAgaWYgKGVuZCA8IDApIHRocm93IG5ldyBSYW5nZUVycm9yKCdzb3VyY2VFbmQgb3V0IG9mIGJvdW5kcycpXG5cbiAgLy8gQXJlIHdlIG9vYj9cbiAgaWYgKGVuZCA+IHRoaXMubGVuZ3RoKSBlbmQgPSB0aGlzLmxlbmd0aFxuICBpZiAodGFyZ2V0Lmxlbmd0aCAtIHRhcmdldFN0YXJ0IDwgZW5kIC0gc3RhcnQpIHtcbiAgICBlbmQgPSB0YXJnZXQubGVuZ3RoIC0gdGFyZ2V0U3RhcnQgKyBzdGFydFxuICB9XG5cbiAgdmFyIGxlbiA9IGVuZCAtIHN0YXJ0XG4gIHZhciBpXG5cbiAgaWYgKHRoaXMgPT09IHRhcmdldCAmJiBzdGFydCA8IHRhcmdldFN0YXJ0ICYmIHRhcmdldFN0YXJ0IDwgZW5kKSB7XG4gICAgLy8gZGVzY2VuZGluZyBjb3B5IGZyb20gZW5kXG4gICAgZm9yIChpID0gbGVuIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgIHRhcmdldFtpICsgdGFyZ2V0U3RhcnRdID0gdGhpc1tpICsgc3RhcnRdXG4gICAgfVxuICB9IGVsc2UgaWYgKGxlbiA8IDEwMDAgfHwgIUJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUKSB7XG4gICAgLy8gYXNjZW5kaW5nIGNvcHkgZnJvbSBzdGFydFxuICAgIGZvciAoaSA9IDA7IGkgPCBsZW47IGkrKykge1xuICAgICAgdGFyZ2V0W2kgKyB0YXJnZXRTdGFydF0gPSB0aGlzW2kgKyBzdGFydF1cbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgdGFyZ2V0Ll9zZXQodGhpcy5zdWJhcnJheShzdGFydCwgc3RhcnQgKyBsZW4pLCB0YXJnZXRTdGFydClcbiAgfVxuXG4gIHJldHVybiBsZW5cbn1cblxuLy8gZmlsbCh2YWx1ZSwgc3RhcnQ9MCwgZW5kPWJ1ZmZlci5sZW5ndGgpXG5CdWZmZXIucHJvdG90eXBlLmZpbGwgPSBmdW5jdGlvbiBmaWxsICh2YWx1ZSwgc3RhcnQsIGVuZCkge1xuICBpZiAoIXZhbHVlKSB2YWx1ZSA9IDBcbiAgaWYgKCFzdGFydCkgc3RhcnQgPSAwXG4gIGlmICghZW5kKSBlbmQgPSB0aGlzLmxlbmd0aFxuXG4gIGlmIChlbmQgPCBzdGFydCkgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ2VuZCA8IHN0YXJ0JylcblxuICAvLyBGaWxsIDAgYnl0ZXM7IHdlJ3JlIGRvbmVcbiAgaWYgKGVuZCA9PT0gc3RhcnQpIHJldHVyblxuICBpZiAodGhpcy5sZW5ndGggPT09IDApIHJldHVyblxuXG4gIGlmIChzdGFydCA8IDAgfHwgc3RhcnQgPj0gdGhpcy5sZW5ndGgpIHRocm93IG5ldyBSYW5nZUVycm9yKCdzdGFydCBvdXQgb2YgYm91bmRzJylcbiAgaWYgKGVuZCA8IDAgfHwgZW5kID4gdGhpcy5sZW5ndGgpIHRocm93IG5ldyBSYW5nZUVycm9yKCdlbmQgb3V0IG9mIGJvdW5kcycpXG5cbiAgdmFyIGlcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicpIHtcbiAgICBmb3IgKGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKSB7XG4gICAgICB0aGlzW2ldID0gdmFsdWVcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgdmFyIGJ5dGVzID0gdXRmOFRvQnl0ZXModmFsdWUudG9TdHJpbmcoKSlcbiAgICB2YXIgbGVuID0gYnl0ZXMubGVuZ3RoXG4gICAgZm9yIChpID0gc3RhcnQ7IGkgPCBlbmQ7IGkrKykge1xuICAgICAgdGhpc1tpXSA9IGJ5dGVzW2kgJSBsZW5dXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHRoaXNcbn1cblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IGBBcnJheUJ1ZmZlcmAgd2l0aCB0aGUgKmNvcGllZCogbWVtb3J5IG9mIHRoZSBidWZmZXIgaW5zdGFuY2UuXG4gKiBBZGRlZCBpbiBOb2RlIDAuMTIuIE9ubHkgYXZhaWxhYmxlIGluIGJyb3dzZXJzIHRoYXQgc3VwcG9ydCBBcnJheUJ1ZmZlci5cbiAqL1xuQnVmZmVyLnByb3RvdHlwZS50b0FycmF5QnVmZmVyID0gZnVuY3Rpb24gdG9BcnJheUJ1ZmZlciAoKSB7XG4gIGlmICh0eXBlb2YgVWludDhBcnJheSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICBpZiAoQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHtcbiAgICAgIHJldHVybiAobmV3IEJ1ZmZlcih0aGlzKSkuYnVmZmVyXG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBidWYgPSBuZXcgVWludDhBcnJheSh0aGlzLmxlbmd0aClcbiAgICAgIGZvciAodmFyIGkgPSAwLCBsZW4gPSBidWYubGVuZ3RoOyBpIDwgbGVuOyBpICs9IDEpIHtcbiAgICAgICAgYnVmW2ldID0gdGhpc1tpXVxuICAgICAgfVxuICAgICAgcmV0dXJuIGJ1Zi5idWZmZXJcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcignQnVmZmVyLnRvQXJyYXlCdWZmZXIgbm90IHN1cHBvcnRlZCBpbiB0aGlzIGJyb3dzZXInKVxuICB9XG59XG5cbi8vIEhFTFBFUiBGVU5DVElPTlNcbi8vID09PT09PT09PT09PT09PT1cblxudmFyIEJQID0gQnVmZmVyLnByb3RvdHlwZVxuXG4vKipcbiAqIEF1Z21lbnQgYSBVaW50OEFycmF5ICppbnN0YW5jZSogKG5vdCB0aGUgVWludDhBcnJheSBjbGFzcyEpIHdpdGggQnVmZmVyIG1ldGhvZHNcbiAqL1xuQnVmZmVyLl9hdWdtZW50ID0gZnVuY3Rpb24gX2F1Z21lbnQgKGFycikge1xuICBhcnIuY29uc3RydWN0b3IgPSBCdWZmZXJcbiAgYXJyLl9pc0J1ZmZlciA9IHRydWVcblxuICAvLyBzYXZlIHJlZmVyZW5jZSB0byBvcmlnaW5hbCBVaW50OEFycmF5IHNldCBtZXRob2QgYmVmb3JlIG92ZXJ3cml0aW5nXG4gIGFyci5fc2V0ID0gYXJyLnNldFxuXG4gIC8vIGRlcHJlY2F0ZWRcbiAgYXJyLmdldCA9IEJQLmdldFxuICBhcnIuc2V0ID0gQlAuc2V0XG5cbiAgYXJyLndyaXRlID0gQlAud3JpdGVcbiAgYXJyLnRvU3RyaW5nID0gQlAudG9TdHJpbmdcbiAgYXJyLnRvTG9jYWxlU3RyaW5nID0gQlAudG9TdHJpbmdcbiAgYXJyLnRvSlNPTiA9IEJQLnRvSlNPTlxuICBhcnIuZXF1YWxzID0gQlAuZXF1YWxzXG4gIGFyci5jb21wYXJlID0gQlAuY29tcGFyZVxuICBhcnIuaW5kZXhPZiA9IEJQLmluZGV4T2ZcbiAgYXJyLmNvcHkgPSBCUC5jb3B5XG4gIGFyci5zbGljZSA9IEJQLnNsaWNlXG4gIGFyci5yZWFkVUludExFID0gQlAucmVhZFVJbnRMRVxuICBhcnIucmVhZFVJbnRCRSA9IEJQLnJlYWRVSW50QkVcbiAgYXJyLnJlYWRVSW50OCA9IEJQLnJlYWRVSW50OFxuICBhcnIucmVhZFVJbnQxNkxFID0gQlAucmVhZFVJbnQxNkxFXG4gIGFyci5yZWFkVUludDE2QkUgPSBCUC5yZWFkVUludDE2QkVcbiAgYXJyLnJlYWRVSW50MzJMRSA9IEJQLnJlYWRVSW50MzJMRVxuICBhcnIucmVhZFVJbnQzMkJFID0gQlAucmVhZFVJbnQzMkJFXG4gIGFyci5yZWFkSW50TEUgPSBCUC5yZWFkSW50TEVcbiAgYXJyLnJlYWRJbnRCRSA9IEJQLnJlYWRJbnRCRVxuICBhcnIucmVhZEludDggPSBCUC5yZWFkSW50OFxuICBhcnIucmVhZEludDE2TEUgPSBCUC5yZWFkSW50MTZMRVxuICBhcnIucmVhZEludDE2QkUgPSBCUC5yZWFkSW50MTZCRVxuICBhcnIucmVhZEludDMyTEUgPSBCUC5yZWFkSW50MzJMRVxuICBhcnIucmVhZEludDMyQkUgPSBCUC5yZWFkSW50MzJCRVxuICBhcnIucmVhZEZsb2F0TEUgPSBCUC5yZWFkRmxvYXRMRVxuICBhcnIucmVhZEZsb2F0QkUgPSBCUC5yZWFkRmxvYXRCRVxuICBhcnIucmVhZERvdWJsZUxFID0gQlAucmVhZERvdWJsZUxFXG4gIGFyci5yZWFkRG91YmxlQkUgPSBCUC5yZWFkRG91YmxlQkVcbiAgYXJyLndyaXRlVUludDggPSBCUC53cml0ZVVJbnQ4XG4gIGFyci53cml0ZVVJbnRMRSA9IEJQLndyaXRlVUludExFXG4gIGFyci53cml0ZVVJbnRCRSA9IEJQLndyaXRlVUludEJFXG4gIGFyci53cml0ZVVJbnQxNkxFID0gQlAud3JpdGVVSW50MTZMRVxuICBhcnIud3JpdGVVSW50MTZCRSA9IEJQLndyaXRlVUludDE2QkVcbiAgYXJyLndyaXRlVUludDMyTEUgPSBCUC53cml0ZVVJbnQzMkxFXG4gIGFyci53cml0ZVVJbnQzMkJFID0gQlAud3JpdGVVSW50MzJCRVxuICBhcnIud3JpdGVJbnRMRSA9IEJQLndyaXRlSW50TEVcbiAgYXJyLndyaXRlSW50QkUgPSBCUC53cml0ZUludEJFXG4gIGFyci53cml0ZUludDggPSBCUC53cml0ZUludDhcbiAgYXJyLndyaXRlSW50MTZMRSA9IEJQLndyaXRlSW50MTZMRVxuICBhcnIud3JpdGVJbnQxNkJFID0gQlAud3JpdGVJbnQxNkJFXG4gIGFyci53cml0ZUludDMyTEUgPSBCUC53cml0ZUludDMyTEVcbiAgYXJyLndyaXRlSW50MzJCRSA9IEJQLndyaXRlSW50MzJCRVxuICBhcnIud3JpdGVGbG9hdExFID0gQlAud3JpdGVGbG9hdExFXG4gIGFyci53cml0ZUZsb2F0QkUgPSBCUC53cml0ZUZsb2F0QkVcbiAgYXJyLndyaXRlRG91YmxlTEUgPSBCUC53cml0ZURvdWJsZUxFXG4gIGFyci53cml0ZURvdWJsZUJFID0gQlAud3JpdGVEb3VibGVCRVxuICBhcnIuZmlsbCA9IEJQLmZpbGxcbiAgYXJyLmluc3BlY3QgPSBCUC5pbnNwZWN0XG4gIGFyci50b0FycmF5QnVmZmVyID0gQlAudG9BcnJheUJ1ZmZlclxuXG4gIHJldHVybiBhcnJcbn1cblxudmFyIElOVkFMSURfQkFTRTY0X1JFID0gL1teK1xcLzAtOUEtWmEtei1fXS9nXG5cbmZ1bmN0aW9uIGJhc2U2NGNsZWFuIChzdHIpIHtcbiAgLy8gTm9kZSBzdHJpcHMgb3V0IGludmFsaWQgY2hhcmFjdGVycyBsaWtlIFxcbiBhbmQgXFx0IGZyb20gdGhlIHN0cmluZywgYmFzZTY0LWpzIGRvZXMgbm90XG4gIHN0ciA9IHN0cmluZ3RyaW0oc3RyKS5yZXBsYWNlKElOVkFMSURfQkFTRTY0X1JFLCAnJylcbiAgLy8gTm9kZSBjb252ZXJ0cyBzdHJpbmdzIHdpdGggbGVuZ3RoIDwgMiB0byAnJ1xuICBpZiAoc3RyLmxlbmd0aCA8IDIpIHJldHVybiAnJ1xuICAvLyBOb2RlIGFsbG93cyBmb3Igbm9uLXBhZGRlZCBiYXNlNjQgc3RyaW5ncyAobWlzc2luZyB0cmFpbGluZyA9PT0pLCBiYXNlNjQtanMgZG9lcyBub3RcbiAgd2hpbGUgKHN0ci5sZW5ndGggJSA0ICE9PSAwKSB7XG4gICAgc3RyID0gc3RyICsgJz0nXG4gIH1cbiAgcmV0dXJuIHN0clxufVxuXG5mdW5jdGlvbiBzdHJpbmd0cmltIChzdHIpIHtcbiAgaWYgKHN0ci50cmltKSByZXR1cm4gc3RyLnRyaW0oKVxuICByZXR1cm4gc3RyLnJlcGxhY2UoL15cXHMrfFxccyskL2csICcnKVxufVxuXG5mdW5jdGlvbiB0b0hleCAobikge1xuICBpZiAobiA8IDE2KSByZXR1cm4gJzAnICsgbi50b1N0cmluZygxNilcbiAgcmV0dXJuIG4udG9TdHJpbmcoMTYpXG59XG5cbmZ1bmN0aW9uIHV0ZjhUb0J5dGVzIChzdHJpbmcsIHVuaXRzKSB7XG4gIHVuaXRzID0gdW5pdHMgfHwgSW5maW5pdHlcbiAgdmFyIGNvZGVQb2ludFxuICB2YXIgbGVuZ3RoID0gc3RyaW5nLmxlbmd0aFxuICB2YXIgbGVhZFN1cnJvZ2F0ZSA9IG51bGxcbiAgdmFyIGJ5dGVzID0gW11cblxuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgY29kZVBvaW50ID0gc3RyaW5nLmNoYXJDb2RlQXQoaSlcblxuICAgIC8vIGlzIHN1cnJvZ2F0ZSBjb21wb25lbnRcbiAgICBpZiAoY29kZVBvaW50ID4gMHhEN0ZGICYmIGNvZGVQb2ludCA8IDB4RTAwMCkge1xuICAgICAgLy8gbGFzdCBjaGFyIHdhcyBhIGxlYWRcbiAgICAgIGlmICghbGVhZFN1cnJvZ2F0ZSkge1xuICAgICAgICAvLyBubyBsZWFkIHlldFxuICAgICAgICBpZiAoY29kZVBvaW50ID4gMHhEQkZGKSB7XG4gICAgICAgICAgLy8gdW5leHBlY3RlZCB0cmFpbFxuICAgICAgICAgIGlmICgodW5pdHMgLT0gMykgPiAtMSkgYnl0ZXMucHVzaCgweEVGLCAweEJGLCAweEJEKVxuICAgICAgICAgIGNvbnRpbnVlXG4gICAgICAgIH0gZWxzZSBpZiAoaSArIDEgPT09IGxlbmd0aCkge1xuICAgICAgICAgIC8vIHVucGFpcmVkIGxlYWRcbiAgICAgICAgICBpZiAoKHVuaXRzIC09IDMpID4gLTEpIGJ5dGVzLnB1c2goMHhFRiwgMHhCRiwgMHhCRClcbiAgICAgICAgICBjb250aW51ZVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gdmFsaWQgbGVhZFxuICAgICAgICBsZWFkU3Vycm9nYXRlID0gY29kZVBvaW50XG5cbiAgICAgICAgY29udGludWVcbiAgICAgIH1cblxuICAgICAgLy8gMiBsZWFkcyBpbiBhIHJvd1xuICAgICAgaWYgKGNvZGVQb2ludCA8IDB4REMwMCkge1xuICAgICAgICBpZiAoKHVuaXRzIC09IDMpID4gLTEpIGJ5dGVzLnB1c2goMHhFRiwgMHhCRiwgMHhCRClcbiAgICAgICAgbGVhZFN1cnJvZ2F0ZSA9IGNvZGVQb2ludFxuICAgICAgICBjb250aW51ZVxuICAgICAgfVxuXG4gICAgICAvLyB2YWxpZCBzdXJyb2dhdGUgcGFpclxuICAgICAgY29kZVBvaW50ID0gKGxlYWRTdXJyb2dhdGUgLSAweEQ4MDAgPDwgMTAgfCBjb2RlUG9pbnQgLSAweERDMDApICsgMHgxMDAwMFxuICAgIH0gZWxzZSBpZiAobGVhZFN1cnJvZ2F0ZSkge1xuICAgICAgLy8gdmFsaWQgYm1wIGNoYXIsIGJ1dCBsYXN0IGNoYXIgd2FzIGEgbGVhZFxuICAgICAgaWYgKCh1bml0cyAtPSAzKSA+IC0xKSBieXRlcy5wdXNoKDB4RUYsIDB4QkYsIDB4QkQpXG4gICAgfVxuXG4gICAgbGVhZFN1cnJvZ2F0ZSA9IG51bGxcblxuICAgIC8vIGVuY29kZSB1dGY4XG4gICAgaWYgKGNvZGVQb2ludCA8IDB4ODApIHtcbiAgICAgIGlmICgodW5pdHMgLT0gMSkgPCAwKSBicmVha1xuICAgICAgYnl0ZXMucHVzaChjb2RlUG9pbnQpXG4gICAgfSBlbHNlIGlmIChjb2RlUG9pbnQgPCAweDgwMCkge1xuICAgICAgaWYgKCh1bml0cyAtPSAyKSA8IDApIGJyZWFrXG4gICAgICBieXRlcy5wdXNoKFxuICAgICAgICBjb2RlUG9pbnQgPj4gMHg2IHwgMHhDMCxcbiAgICAgICAgY29kZVBvaW50ICYgMHgzRiB8IDB4ODBcbiAgICAgIClcbiAgICB9IGVsc2UgaWYgKGNvZGVQb2ludCA8IDB4MTAwMDApIHtcbiAgICAgIGlmICgodW5pdHMgLT0gMykgPCAwKSBicmVha1xuICAgICAgYnl0ZXMucHVzaChcbiAgICAgICAgY29kZVBvaW50ID4+IDB4QyB8IDB4RTAsXG4gICAgICAgIGNvZGVQb2ludCA+PiAweDYgJiAweDNGIHwgMHg4MCxcbiAgICAgICAgY29kZVBvaW50ICYgMHgzRiB8IDB4ODBcbiAgICAgIClcbiAgICB9IGVsc2UgaWYgKGNvZGVQb2ludCA8IDB4MTEwMDAwKSB7XG4gICAgICBpZiAoKHVuaXRzIC09IDQpIDwgMCkgYnJlYWtcbiAgICAgIGJ5dGVzLnB1c2goXG4gICAgICAgIGNvZGVQb2ludCA+PiAweDEyIHwgMHhGMCxcbiAgICAgICAgY29kZVBvaW50ID4+IDB4QyAmIDB4M0YgfCAweDgwLFxuICAgICAgICBjb2RlUG9pbnQgPj4gMHg2ICYgMHgzRiB8IDB4ODAsXG4gICAgICAgIGNvZGVQb2ludCAmIDB4M0YgfCAweDgwXG4gICAgICApXG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBjb2RlIHBvaW50JylcbiAgICB9XG4gIH1cblxuICByZXR1cm4gYnl0ZXNcbn1cblxuZnVuY3Rpb24gYXNjaWlUb0J5dGVzIChzdHIpIHtcbiAgdmFyIGJ5dGVBcnJheSA9IFtdXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc3RyLmxlbmd0aDsgaSsrKSB7XG4gICAgLy8gTm9kZSdzIGNvZGUgc2VlbXMgdG8gYmUgZG9pbmcgdGhpcyBhbmQgbm90ICYgMHg3Ri4uXG4gICAgYnl0ZUFycmF5LnB1c2goc3RyLmNoYXJDb2RlQXQoaSkgJiAweEZGKVxuICB9XG4gIHJldHVybiBieXRlQXJyYXlcbn1cblxuZnVuY3Rpb24gdXRmMTZsZVRvQnl0ZXMgKHN0ciwgdW5pdHMpIHtcbiAgdmFyIGMsIGhpLCBsb1xuICB2YXIgYnl0ZUFycmF5ID0gW11cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBzdHIubGVuZ3RoOyBpKyspIHtcbiAgICBpZiAoKHVuaXRzIC09IDIpIDwgMCkgYnJlYWtcblxuICAgIGMgPSBzdHIuY2hhckNvZGVBdChpKVxuICAgIGhpID0gYyA+PiA4XG4gICAgbG8gPSBjICUgMjU2XG4gICAgYnl0ZUFycmF5LnB1c2gobG8pXG4gICAgYnl0ZUFycmF5LnB1c2goaGkpXG4gIH1cblxuICByZXR1cm4gYnl0ZUFycmF5XG59XG5cbmZ1bmN0aW9uIGJhc2U2NFRvQnl0ZXMgKHN0cikge1xuICByZXR1cm4gYmFzZTY0LnRvQnl0ZUFycmF5KGJhc2U2NGNsZWFuKHN0cikpXG59XG5cbmZ1bmN0aW9uIGJsaXRCdWZmZXIgKHNyYywgZHN0LCBvZmZzZXQsIGxlbmd0aCkge1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgaWYgKChpICsgb2Zmc2V0ID49IGRzdC5sZW5ndGgpIHx8IChpID49IHNyYy5sZW5ndGgpKSBicmVha1xuICAgIGRzdFtpICsgb2Zmc2V0XSA9IHNyY1tpXVxuICB9XG4gIHJldHVybiBpXG59XG4iLCJ2YXIgbG9va3VwID0gJ0FCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXowMTIzNDU2Nzg5Ky8nO1xuXG47KGZ1bmN0aW9uIChleHBvcnRzKSB7XG5cdCd1c2Ugc3RyaWN0JztcblxuICB2YXIgQXJyID0gKHR5cGVvZiBVaW50OEFycmF5ICE9PSAndW5kZWZpbmVkJylcbiAgICA/IFVpbnQ4QXJyYXlcbiAgICA6IEFycmF5XG5cblx0dmFyIFBMVVMgICA9ICcrJy5jaGFyQ29kZUF0KDApXG5cdHZhciBTTEFTSCAgPSAnLycuY2hhckNvZGVBdCgwKVxuXHR2YXIgTlVNQkVSID0gJzAnLmNoYXJDb2RlQXQoMClcblx0dmFyIExPV0VSICA9ICdhJy5jaGFyQ29kZUF0KDApXG5cdHZhciBVUFBFUiAgPSAnQScuY2hhckNvZGVBdCgwKVxuXHR2YXIgUExVU19VUkxfU0FGRSA9ICctJy5jaGFyQ29kZUF0KDApXG5cdHZhciBTTEFTSF9VUkxfU0FGRSA9ICdfJy5jaGFyQ29kZUF0KDApXG5cblx0ZnVuY3Rpb24gZGVjb2RlIChlbHQpIHtcblx0XHR2YXIgY29kZSA9IGVsdC5jaGFyQ29kZUF0KDApXG5cdFx0aWYgKGNvZGUgPT09IFBMVVMgfHxcblx0XHQgICAgY29kZSA9PT0gUExVU19VUkxfU0FGRSlcblx0XHRcdHJldHVybiA2MiAvLyAnKydcblx0XHRpZiAoY29kZSA9PT0gU0xBU0ggfHxcblx0XHQgICAgY29kZSA9PT0gU0xBU0hfVVJMX1NBRkUpXG5cdFx0XHRyZXR1cm4gNjMgLy8gJy8nXG5cdFx0aWYgKGNvZGUgPCBOVU1CRVIpXG5cdFx0XHRyZXR1cm4gLTEgLy9ubyBtYXRjaFxuXHRcdGlmIChjb2RlIDwgTlVNQkVSICsgMTApXG5cdFx0XHRyZXR1cm4gY29kZSAtIE5VTUJFUiArIDI2ICsgMjZcblx0XHRpZiAoY29kZSA8IFVQUEVSICsgMjYpXG5cdFx0XHRyZXR1cm4gY29kZSAtIFVQUEVSXG5cdFx0aWYgKGNvZGUgPCBMT1dFUiArIDI2KVxuXHRcdFx0cmV0dXJuIGNvZGUgLSBMT1dFUiArIDI2XG5cdH1cblxuXHRmdW5jdGlvbiBiNjRUb0J5dGVBcnJheSAoYjY0KSB7XG5cdFx0dmFyIGksIGosIGwsIHRtcCwgcGxhY2VIb2xkZXJzLCBhcnJcblxuXHRcdGlmIChiNjQubGVuZ3RoICUgNCA+IDApIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBzdHJpbmcuIExlbmd0aCBtdXN0IGJlIGEgbXVsdGlwbGUgb2YgNCcpXG5cdFx0fVxuXG5cdFx0Ly8gdGhlIG51bWJlciBvZiBlcXVhbCBzaWducyAocGxhY2UgaG9sZGVycylcblx0XHQvLyBpZiB0aGVyZSBhcmUgdHdvIHBsYWNlaG9sZGVycywgdGhhbiB0aGUgdHdvIGNoYXJhY3RlcnMgYmVmb3JlIGl0XG5cdFx0Ly8gcmVwcmVzZW50IG9uZSBieXRlXG5cdFx0Ly8gaWYgdGhlcmUgaXMgb25seSBvbmUsIHRoZW4gdGhlIHRocmVlIGNoYXJhY3RlcnMgYmVmb3JlIGl0IHJlcHJlc2VudCAyIGJ5dGVzXG5cdFx0Ly8gdGhpcyBpcyBqdXN0IGEgY2hlYXAgaGFjayB0byBub3QgZG8gaW5kZXhPZiB0d2ljZVxuXHRcdHZhciBsZW4gPSBiNjQubGVuZ3RoXG5cdFx0cGxhY2VIb2xkZXJzID0gJz0nID09PSBiNjQuY2hhckF0KGxlbiAtIDIpID8gMiA6ICc9JyA9PT0gYjY0LmNoYXJBdChsZW4gLSAxKSA/IDEgOiAwXG5cblx0XHQvLyBiYXNlNjQgaXMgNC8zICsgdXAgdG8gdHdvIGNoYXJhY3RlcnMgb2YgdGhlIG9yaWdpbmFsIGRhdGFcblx0XHRhcnIgPSBuZXcgQXJyKGI2NC5sZW5ndGggKiAzIC8gNCAtIHBsYWNlSG9sZGVycylcblxuXHRcdC8vIGlmIHRoZXJlIGFyZSBwbGFjZWhvbGRlcnMsIG9ubHkgZ2V0IHVwIHRvIHRoZSBsYXN0IGNvbXBsZXRlIDQgY2hhcnNcblx0XHRsID0gcGxhY2VIb2xkZXJzID4gMCA/IGI2NC5sZW5ndGggLSA0IDogYjY0Lmxlbmd0aFxuXG5cdFx0dmFyIEwgPSAwXG5cblx0XHRmdW5jdGlvbiBwdXNoICh2KSB7XG5cdFx0XHRhcnJbTCsrXSA9IHZcblx0XHR9XG5cblx0XHRmb3IgKGkgPSAwLCBqID0gMDsgaSA8IGw7IGkgKz0gNCwgaiArPSAzKSB7XG5cdFx0XHR0bXAgPSAoZGVjb2RlKGI2NC5jaGFyQXQoaSkpIDw8IDE4KSB8IChkZWNvZGUoYjY0LmNoYXJBdChpICsgMSkpIDw8IDEyKSB8IChkZWNvZGUoYjY0LmNoYXJBdChpICsgMikpIDw8IDYpIHwgZGVjb2RlKGI2NC5jaGFyQXQoaSArIDMpKVxuXHRcdFx0cHVzaCgodG1wICYgMHhGRjAwMDApID4+IDE2KVxuXHRcdFx0cHVzaCgodG1wICYgMHhGRjAwKSA+PiA4KVxuXHRcdFx0cHVzaCh0bXAgJiAweEZGKVxuXHRcdH1cblxuXHRcdGlmIChwbGFjZUhvbGRlcnMgPT09IDIpIHtcblx0XHRcdHRtcCA9IChkZWNvZGUoYjY0LmNoYXJBdChpKSkgPDwgMikgfCAoZGVjb2RlKGI2NC5jaGFyQXQoaSArIDEpKSA+PiA0KVxuXHRcdFx0cHVzaCh0bXAgJiAweEZGKVxuXHRcdH0gZWxzZSBpZiAocGxhY2VIb2xkZXJzID09PSAxKSB7XG5cdFx0XHR0bXAgPSAoZGVjb2RlKGI2NC5jaGFyQXQoaSkpIDw8IDEwKSB8IChkZWNvZGUoYjY0LmNoYXJBdChpICsgMSkpIDw8IDQpIHwgKGRlY29kZShiNjQuY2hhckF0KGkgKyAyKSkgPj4gMilcblx0XHRcdHB1c2goKHRtcCA+PiA4KSAmIDB4RkYpXG5cdFx0XHRwdXNoKHRtcCAmIDB4RkYpXG5cdFx0fVxuXG5cdFx0cmV0dXJuIGFyclxuXHR9XG5cblx0ZnVuY3Rpb24gdWludDhUb0Jhc2U2NCAodWludDgpIHtcblx0XHR2YXIgaSxcblx0XHRcdGV4dHJhQnl0ZXMgPSB1aW50OC5sZW5ndGggJSAzLCAvLyBpZiB3ZSBoYXZlIDEgYnl0ZSBsZWZ0LCBwYWQgMiBieXRlc1xuXHRcdFx0b3V0cHV0ID0gXCJcIixcblx0XHRcdHRlbXAsIGxlbmd0aFxuXG5cdFx0ZnVuY3Rpb24gZW5jb2RlIChudW0pIHtcblx0XHRcdHJldHVybiBsb29rdXAuY2hhckF0KG51bSlcblx0XHR9XG5cblx0XHRmdW5jdGlvbiB0cmlwbGV0VG9CYXNlNjQgKG51bSkge1xuXHRcdFx0cmV0dXJuIGVuY29kZShudW0gPj4gMTggJiAweDNGKSArIGVuY29kZShudW0gPj4gMTIgJiAweDNGKSArIGVuY29kZShudW0gPj4gNiAmIDB4M0YpICsgZW5jb2RlKG51bSAmIDB4M0YpXG5cdFx0fVxuXG5cdFx0Ly8gZ28gdGhyb3VnaCB0aGUgYXJyYXkgZXZlcnkgdGhyZWUgYnl0ZXMsIHdlJ2xsIGRlYWwgd2l0aCB0cmFpbGluZyBzdHVmZiBsYXRlclxuXHRcdGZvciAoaSA9IDAsIGxlbmd0aCA9IHVpbnQ4Lmxlbmd0aCAtIGV4dHJhQnl0ZXM7IGkgPCBsZW5ndGg7IGkgKz0gMykge1xuXHRcdFx0dGVtcCA9ICh1aW50OFtpXSA8PCAxNikgKyAodWludDhbaSArIDFdIDw8IDgpICsgKHVpbnQ4W2kgKyAyXSlcblx0XHRcdG91dHB1dCArPSB0cmlwbGV0VG9CYXNlNjQodGVtcClcblx0XHR9XG5cblx0XHQvLyBwYWQgdGhlIGVuZCB3aXRoIHplcm9zLCBidXQgbWFrZSBzdXJlIHRvIG5vdCBmb3JnZXQgdGhlIGV4dHJhIGJ5dGVzXG5cdFx0c3dpdGNoIChleHRyYUJ5dGVzKSB7XG5cdFx0XHRjYXNlIDE6XG5cdFx0XHRcdHRlbXAgPSB1aW50OFt1aW50OC5sZW5ndGggLSAxXVxuXHRcdFx0XHRvdXRwdXQgKz0gZW5jb2RlKHRlbXAgPj4gMilcblx0XHRcdFx0b3V0cHV0ICs9IGVuY29kZSgodGVtcCA8PCA0KSAmIDB4M0YpXG5cdFx0XHRcdG91dHB1dCArPSAnPT0nXG5cdFx0XHRcdGJyZWFrXG5cdFx0XHRjYXNlIDI6XG5cdFx0XHRcdHRlbXAgPSAodWludDhbdWludDgubGVuZ3RoIC0gMl0gPDwgOCkgKyAodWludDhbdWludDgubGVuZ3RoIC0gMV0pXG5cdFx0XHRcdG91dHB1dCArPSBlbmNvZGUodGVtcCA+PiAxMClcblx0XHRcdFx0b3V0cHV0ICs9IGVuY29kZSgodGVtcCA+PiA0KSAmIDB4M0YpXG5cdFx0XHRcdG91dHB1dCArPSBlbmNvZGUoKHRlbXAgPDwgMikgJiAweDNGKVxuXHRcdFx0XHRvdXRwdXQgKz0gJz0nXG5cdFx0XHRcdGJyZWFrXG5cdFx0fVxuXG5cdFx0cmV0dXJuIG91dHB1dFxuXHR9XG5cblx0ZXhwb3J0cy50b0J5dGVBcnJheSA9IGI2NFRvQnl0ZUFycmF5XG5cdGV4cG9ydHMuZnJvbUJ5dGVBcnJheSA9IHVpbnQ4VG9CYXNlNjRcbn0odHlwZW9mIGV4cG9ydHMgPT09ICd1bmRlZmluZWQnID8gKHRoaXMuYmFzZTY0anMgPSB7fSkgOiBleHBvcnRzKSlcbiIsImV4cG9ydHMucmVhZCA9IGZ1bmN0aW9uIChidWZmZXIsIG9mZnNldCwgaXNMRSwgbUxlbiwgbkJ5dGVzKSB7XG4gIHZhciBlLCBtXG4gIHZhciBlTGVuID0gbkJ5dGVzICogOCAtIG1MZW4gLSAxXG4gIHZhciBlTWF4ID0gKDEgPDwgZUxlbikgLSAxXG4gIHZhciBlQmlhcyA9IGVNYXggPj4gMVxuICB2YXIgbkJpdHMgPSAtN1xuICB2YXIgaSA9IGlzTEUgPyAobkJ5dGVzIC0gMSkgOiAwXG4gIHZhciBkID0gaXNMRSA/IC0xIDogMVxuICB2YXIgcyA9IGJ1ZmZlcltvZmZzZXQgKyBpXVxuXG4gIGkgKz0gZFxuXG4gIGUgPSBzICYgKCgxIDw8ICgtbkJpdHMpKSAtIDEpXG4gIHMgPj49ICgtbkJpdHMpXG4gIG5CaXRzICs9IGVMZW5cbiAgZm9yICg7IG5CaXRzID4gMDsgZSA9IGUgKiAyNTYgKyBidWZmZXJbb2Zmc2V0ICsgaV0sIGkgKz0gZCwgbkJpdHMgLT0gOCkge31cblxuICBtID0gZSAmICgoMSA8PCAoLW5CaXRzKSkgLSAxKVxuICBlID4+PSAoLW5CaXRzKVxuICBuQml0cyArPSBtTGVuXG4gIGZvciAoOyBuQml0cyA+IDA7IG0gPSBtICogMjU2ICsgYnVmZmVyW29mZnNldCArIGldLCBpICs9IGQsIG5CaXRzIC09IDgpIHt9XG5cbiAgaWYgKGUgPT09IDApIHtcbiAgICBlID0gMSAtIGVCaWFzXG4gIH0gZWxzZSBpZiAoZSA9PT0gZU1heCkge1xuICAgIHJldHVybiBtID8gTmFOIDogKChzID8gLTEgOiAxKSAqIEluZmluaXR5KVxuICB9IGVsc2Uge1xuICAgIG0gPSBtICsgTWF0aC5wb3coMiwgbUxlbilcbiAgICBlID0gZSAtIGVCaWFzXG4gIH1cbiAgcmV0dXJuIChzID8gLTEgOiAxKSAqIG0gKiBNYXRoLnBvdygyLCBlIC0gbUxlbilcbn1cblxuZXhwb3J0cy53cml0ZSA9IGZ1bmN0aW9uIChidWZmZXIsIHZhbHVlLCBvZmZzZXQsIGlzTEUsIG1MZW4sIG5CeXRlcykge1xuICB2YXIgZSwgbSwgY1xuICB2YXIgZUxlbiA9IG5CeXRlcyAqIDggLSBtTGVuIC0gMVxuICB2YXIgZU1heCA9ICgxIDw8IGVMZW4pIC0gMVxuICB2YXIgZUJpYXMgPSBlTWF4ID4+IDFcbiAgdmFyIHJ0ID0gKG1MZW4gPT09IDIzID8gTWF0aC5wb3coMiwgLTI0KSAtIE1hdGgucG93KDIsIC03NykgOiAwKVxuICB2YXIgaSA9IGlzTEUgPyAwIDogKG5CeXRlcyAtIDEpXG4gIHZhciBkID0gaXNMRSA/IDEgOiAtMVxuICB2YXIgcyA9IHZhbHVlIDwgMCB8fCAodmFsdWUgPT09IDAgJiYgMSAvIHZhbHVlIDwgMCkgPyAxIDogMFxuXG4gIHZhbHVlID0gTWF0aC5hYnModmFsdWUpXG5cbiAgaWYgKGlzTmFOKHZhbHVlKSB8fCB2YWx1ZSA9PT0gSW5maW5pdHkpIHtcbiAgICBtID0gaXNOYU4odmFsdWUpID8gMSA6IDBcbiAgICBlID0gZU1heFxuICB9IGVsc2Uge1xuICAgIGUgPSBNYXRoLmZsb29yKE1hdGgubG9nKHZhbHVlKSAvIE1hdGguTE4yKVxuICAgIGlmICh2YWx1ZSAqIChjID0gTWF0aC5wb3coMiwgLWUpKSA8IDEpIHtcbiAgICAgIGUtLVxuICAgICAgYyAqPSAyXG4gICAgfVxuICAgIGlmIChlICsgZUJpYXMgPj0gMSkge1xuICAgICAgdmFsdWUgKz0gcnQgLyBjXG4gICAgfSBlbHNlIHtcbiAgICAgIHZhbHVlICs9IHJ0ICogTWF0aC5wb3coMiwgMSAtIGVCaWFzKVxuICAgIH1cbiAgICBpZiAodmFsdWUgKiBjID49IDIpIHtcbiAgICAgIGUrK1xuICAgICAgYyAvPSAyXG4gICAgfVxuXG4gICAgaWYgKGUgKyBlQmlhcyA+PSBlTWF4KSB7XG4gICAgICBtID0gMFxuICAgICAgZSA9IGVNYXhcbiAgICB9IGVsc2UgaWYgKGUgKyBlQmlhcyA+PSAxKSB7XG4gICAgICBtID0gKHZhbHVlICogYyAtIDEpICogTWF0aC5wb3coMiwgbUxlbilcbiAgICAgIGUgPSBlICsgZUJpYXNcbiAgICB9IGVsc2Uge1xuICAgICAgbSA9IHZhbHVlICogTWF0aC5wb3coMiwgZUJpYXMgLSAxKSAqIE1hdGgucG93KDIsIG1MZW4pXG4gICAgICBlID0gMFxuICAgIH1cbiAgfVxuXG4gIGZvciAoOyBtTGVuID49IDg7IGJ1ZmZlcltvZmZzZXQgKyBpXSA9IG0gJiAweGZmLCBpICs9IGQsIG0gLz0gMjU2LCBtTGVuIC09IDgpIHt9XG5cbiAgZSA9IChlIDw8IG1MZW4pIHwgbVxuICBlTGVuICs9IG1MZW5cbiAgZm9yICg7IGVMZW4gPiAwOyBidWZmZXJbb2Zmc2V0ICsgaV0gPSBlICYgMHhmZiwgaSArPSBkLCBlIC89IDI1NiwgZUxlbiAtPSA4KSB7fVxuXG4gIGJ1ZmZlcltvZmZzZXQgKyBpIC0gZF0gfD0gcyAqIDEyOFxufVxuIiwiXG4vKipcbiAqIGlzQXJyYXlcbiAqL1xuXG52YXIgaXNBcnJheSA9IEFycmF5LmlzQXJyYXk7XG5cbi8qKlxuICogdG9TdHJpbmdcbiAqL1xuXG52YXIgc3RyID0gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZztcblxuLyoqXG4gKiBXaGV0aGVyIG9yIG5vdCB0aGUgZ2l2ZW4gYHZhbGBcbiAqIGlzIGFuIGFycmF5LlxuICpcbiAqIGV4YW1wbGU6XG4gKlxuICogICAgICAgIGlzQXJyYXkoW10pO1xuICogICAgICAgIC8vID4gdHJ1ZVxuICogICAgICAgIGlzQXJyYXkoYXJndW1lbnRzKTtcbiAqICAgICAgICAvLyA+IGZhbHNlXG4gKiAgICAgICAgaXNBcnJheSgnJyk7XG4gKiAgICAgICAgLy8gPiBmYWxzZVxuICpcbiAqIEBwYXJhbSB7bWl4ZWR9IHZhbFxuICogQHJldHVybiB7Ym9vbH1cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGlzQXJyYXkgfHwgZnVuY3Rpb24gKHZhbCkge1xuICByZXR1cm4gISEgdmFsICYmICdbb2JqZWN0IEFycmF5XScgPT0gc3RyLmNhbGwodmFsKTtcbn07XG4iLCIvKlxuXG4gIEphdmFzY3JpcHQgU3RhdGUgTWFjaGluZSBMaWJyYXJ5IC0gaHR0cHM6Ly9naXRodWIuY29tL2pha2VzZ29yZG9uL2phdmFzY3JpcHQtc3RhdGUtbWFjaGluZVxuXG4gIENvcHlyaWdodCAoYykgMjAxMiwgMjAxMywgMjAxNCwgMjAxNSwgSmFrZSBHb3Jkb24gYW5kIGNvbnRyaWJ1dG9yc1xuICBSZWxlYXNlZCB1bmRlciB0aGUgTUlUIGxpY2Vuc2UgLSBodHRwczovL2dpdGh1Yi5jb20vamFrZXNnb3Jkb24vamF2YXNjcmlwdC1zdGF0ZS1tYWNoaW5lL2Jsb2IvbWFzdGVyL0xJQ0VOU0VcblxuKi9cblxuKGZ1bmN0aW9uICgpIHtcblxuICB2YXIgU3RhdGVNYWNoaW5lID0ge1xuXG4gICAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICAgIFZFUlNJT046IFwiMi4zLjVcIixcblxuICAgIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgICBSZXN1bHQ6IHtcbiAgICAgIFNVQ0NFRURFRDogICAgMSwgLy8gdGhlIGV2ZW50IHRyYW5zaXRpb25lZCBzdWNjZXNzZnVsbHkgZnJvbSBvbmUgc3RhdGUgdG8gYW5vdGhlclxuICAgICAgTk9UUkFOU0lUSU9OOiAyLCAvLyB0aGUgZXZlbnQgd2FzIHN1Y2Nlc3NmdWxsIGJ1dCBubyBzdGF0ZSB0cmFuc2l0aW9uIHdhcyBuZWNlc3NhcnlcbiAgICAgIENBTkNFTExFRDogICAgMywgLy8gdGhlIGV2ZW50IHdhcyBjYW5jZWxsZWQgYnkgdGhlIGNhbGxlciBpbiBhIGJlZm9yZUV2ZW50IGNhbGxiYWNrXG4gICAgICBQRU5ESU5HOiAgICAgIDQgIC8vIHRoZSBldmVudCBpcyBhc3luY2hyb25vdXMgYW5kIHRoZSBjYWxsZXIgaXMgaW4gY29udHJvbCBvZiB3aGVuIHRoZSB0cmFuc2l0aW9uIG9jY3Vyc1xuICAgIH0sXG5cbiAgICBFcnJvcjoge1xuICAgICAgSU5WQUxJRF9UUkFOU0lUSU9OOiAxMDAsIC8vIGNhbGxlciB0cmllZCB0byBmaXJlIGFuIGV2ZW50IHRoYXQgd2FzIGlubmFwcm9wcmlhdGUgaW4gdGhlIGN1cnJlbnQgc3RhdGVcbiAgICAgIFBFTkRJTkdfVFJBTlNJVElPTjogMjAwLCAvLyBjYWxsZXIgdHJpZWQgdG8gZmlyZSBhbiBldmVudCB3aGlsZSBhbiBhc3luYyB0cmFuc2l0aW9uIHdhcyBzdGlsbCBwZW5kaW5nXG4gICAgICBJTlZBTElEX0NBTExCQUNLOiAgIDMwMCAvLyBjYWxsZXIgcHJvdmlkZWQgY2FsbGJhY2sgZnVuY3Rpb24gdGhyZXcgYW4gZXhjZXB0aW9uXG4gICAgfSxcblxuICAgIFdJTERDQVJEOiAnKicsXG4gICAgQVNZTkM6ICdhc3luYycsXG5cbiAgICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gICAgY3JlYXRlOiBmdW5jdGlvbihjZmcsIHRhcmdldCkge1xuXG4gICAgICB2YXIgaW5pdGlhbCAgICAgID0gKHR5cGVvZiBjZmcuaW5pdGlhbCA9PSAnc3RyaW5nJykgPyB7IHN0YXRlOiBjZmcuaW5pdGlhbCB9IDogY2ZnLmluaXRpYWw7IC8vIGFsbG93IGZvciBhIHNpbXBsZSBzdHJpbmcsIG9yIGFuIG9iamVjdCB3aXRoIHsgc3RhdGU6ICdmb28nLCBldmVudDogJ3NldHVwJywgZGVmZXI6IHRydWV8ZmFsc2UgfVxuICAgICAgdmFyIHRlcm1pbmFsICAgICA9IGNmZy50ZXJtaW5hbCB8fCBjZmdbJ2ZpbmFsJ107XG4gICAgICB2YXIgZnNtICAgICAgICAgID0gdGFyZ2V0IHx8IGNmZy50YXJnZXQgIHx8IHt9O1xuICAgICAgdmFyIGV2ZW50cyAgICAgICA9IGNmZy5ldmVudHMgfHwgW107XG4gICAgICB2YXIgY2FsbGJhY2tzICAgID0gY2ZnLmNhbGxiYWNrcyB8fCB7fTtcbiAgICAgIHZhciBtYXAgICAgICAgICAgPSB7fTsgLy8gdHJhY2sgc3RhdGUgdHJhbnNpdGlvbnMgYWxsb3dlZCBmb3IgYW4gZXZlbnQgeyBldmVudDogeyBmcm9tOiBbIHRvIF0gfSB9XG4gICAgICB2YXIgdHJhbnNpdGlvbnMgID0ge307IC8vIHRyYWNrIGV2ZW50cyBhbGxvd2VkIGZyb20gYSBzdGF0ZSAgICAgICAgICAgIHsgc3RhdGU6IFsgZXZlbnQgXSB9XG5cbiAgICAgIHZhciBhZGQgPSBmdW5jdGlvbihlKSB7XG4gICAgICAgIHZhciBmcm9tID0gKGUuZnJvbSBpbnN0YW5jZW9mIEFycmF5KSA/IGUuZnJvbSA6IChlLmZyb20gPyBbZS5mcm9tXSA6IFtTdGF0ZU1hY2hpbmUuV0lMRENBUkRdKTsgLy8gYWxsb3cgJ3dpbGRjYXJkJyB0cmFuc2l0aW9uIGlmICdmcm9tJyBpcyBub3Qgc3BlY2lmaWVkXG4gICAgICAgIG1hcFtlLm5hbWVdID0gbWFwW2UubmFtZV0gfHwge307XG4gICAgICAgIGZvciAodmFyIG4gPSAwIDsgbiA8IGZyb20ubGVuZ3RoIDsgbisrKSB7XG4gICAgICAgICAgdHJhbnNpdGlvbnNbZnJvbVtuXV0gPSB0cmFuc2l0aW9uc1tmcm9tW25dXSB8fCBbXTtcbiAgICAgICAgICB0cmFuc2l0aW9uc1tmcm9tW25dXS5wdXNoKGUubmFtZSk7XG5cbiAgICAgICAgICBtYXBbZS5uYW1lXVtmcm9tW25dXSA9IGUudG8gfHwgZnJvbVtuXTsgLy8gYWxsb3cgbm8tb3AgdHJhbnNpdGlvbiBpZiAndG8nIGlzIG5vdCBzcGVjaWZpZWRcbiAgICAgICAgfVxuICAgICAgfTtcblxuICAgICAgaWYgKGluaXRpYWwpIHtcbiAgICAgICAgaW5pdGlhbC5ldmVudCA9IGluaXRpYWwuZXZlbnQgfHwgJ3N0YXJ0dXAnO1xuICAgICAgICBhZGQoeyBuYW1lOiBpbml0aWFsLmV2ZW50LCBmcm9tOiAnbm9uZScsIHRvOiBpbml0aWFsLnN0YXRlIH0pO1xuICAgICAgfVxuXG4gICAgICBmb3IodmFyIG4gPSAwIDsgbiA8IGV2ZW50cy5sZW5ndGggOyBuKyspXG4gICAgICAgIGFkZChldmVudHNbbl0pO1xuXG4gICAgICBmb3IodmFyIG5hbWUgaW4gbWFwKSB7XG4gICAgICAgIGlmIChtYXAuaGFzT3duUHJvcGVydHkobmFtZSkpXG4gICAgICAgICAgZnNtW25hbWVdID0gU3RhdGVNYWNoaW5lLmJ1aWxkRXZlbnQobmFtZSwgbWFwW25hbWVdKTtcbiAgICAgIH1cblxuICAgICAgZm9yKHZhciBuYW1lIGluIGNhbGxiYWNrcykge1xuICAgICAgICBpZiAoY2FsbGJhY2tzLmhhc093blByb3BlcnR5KG5hbWUpKVxuICAgICAgICAgIGZzbVtuYW1lXSA9IGNhbGxiYWNrc1tuYW1lXVxuICAgICAgfVxuXG4gICAgICBmc20uY3VycmVudCAgICAgPSAnbm9uZSc7XG4gICAgICBmc20uaXMgICAgICAgICAgPSBmdW5jdGlvbihzdGF0ZSkgeyByZXR1cm4gKHN0YXRlIGluc3RhbmNlb2YgQXJyYXkpID8gKHN0YXRlLmluZGV4T2YodGhpcy5jdXJyZW50KSA+PSAwKSA6ICh0aGlzLmN1cnJlbnQgPT09IHN0YXRlKTsgfTtcbiAgICAgIGZzbS5jYW4gICAgICAgICA9IGZ1bmN0aW9uKGV2ZW50KSB7IHJldHVybiAhdGhpcy50cmFuc2l0aW9uICYmIChtYXBbZXZlbnRdLmhhc093blByb3BlcnR5KHRoaXMuY3VycmVudCkgfHwgbWFwW2V2ZW50XS5oYXNPd25Qcm9wZXJ0eShTdGF0ZU1hY2hpbmUuV0lMRENBUkQpKTsgfVxuICAgICAgZnNtLmNhbm5vdCAgICAgID0gZnVuY3Rpb24oZXZlbnQpIHsgcmV0dXJuICF0aGlzLmNhbihldmVudCk7IH07XG4gICAgICBmc20udHJhbnNpdGlvbnMgPSBmdW5jdGlvbigpICAgICAgeyByZXR1cm4gdHJhbnNpdGlvbnNbdGhpcy5jdXJyZW50XTsgfTtcbiAgICAgIGZzbS5pc0ZpbmlzaGVkICA9IGZ1bmN0aW9uKCkgICAgICB7IHJldHVybiB0aGlzLmlzKHRlcm1pbmFsKTsgfTtcbiAgICAgIGZzbS5lcnJvciAgICAgICA9IGNmZy5lcnJvciB8fCBmdW5jdGlvbihuYW1lLCBmcm9tLCB0bywgYXJncywgZXJyb3IsIG1zZywgZSkgeyB0aHJvdyBlIHx8IG1zZzsgfTsgLy8gZGVmYXVsdCBiZWhhdmlvciB3aGVuIHNvbWV0aGluZyB1bmV4cGVjdGVkIGhhcHBlbnMgaXMgdG8gdGhyb3cgYW4gZXhjZXB0aW9uLCBidXQgY2FsbGVyIGNhbiBvdmVycmlkZSB0aGlzIGJlaGF2aW9yIGlmIGRlc2lyZWQgKHNlZSBnaXRodWIgaXNzdWUgIzMgYW5kICMxNylcblxuICAgICAgaWYgKGluaXRpYWwgJiYgIWluaXRpYWwuZGVmZXIpXG4gICAgICAgIGZzbVtpbml0aWFsLmV2ZW50XSgpO1xuXG4gICAgICByZXR1cm4gZnNtO1xuXG4gICAgfSxcblxuICAgIC8vPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbiAgICBkb0NhbGxiYWNrOiBmdW5jdGlvbihmc20sIGZ1bmMsIG5hbWUsIGZyb20sIHRvLCBhcmdzKSB7XG4gICAgICBpZiAoZnVuYykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIHJldHVybiBmdW5jLmFwcGx5KGZzbSwgW25hbWUsIGZyb20sIHRvXS5jb25jYXQoYXJncykpO1xuICAgICAgICB9XG4gICAgICAgIGNhdGNoKGUpIHtcbiAgICAgICAgICByZXR1cm4gZnNtLmVycm9yKG5hbWUsIGZyb20sIHRvLCBhcmdzLCBTdGF0ZU1hY2hpbmUuRXJyb3IuSU5WQUxJRF9DQUxMQkFDSywgXCJhbiBleGNlcHRpb24gb2NjdXJyZWQgaW4gYSBjYWxsZXItcHJvdmlkZWQgY2FsbGJhY2sgZnVuY3Rpb25cIiwgZSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuXG4gICAgYmVmb3JlQW55RXZlbnQ6ICBmdW5jdGlvbihmc20sIG5hbWUsIGZyb20sIHRvLCBhcmdzKSB7IHJldHVybiBTdGF0ZU1hY2hpbmUuZG9DYWxsYmFjayhmc20sIGZzbVsnb25iZWZvcmVldmVudCddLCAgICAgICAgICAgICAgICAgICAgICAgbmFtZSwgZnJvbSwgdG8sIGFyZ3MpOyB9LFxuICAgIGFmdGVyQW55RXZlbnQ6ICAgZnVuY3Rpb24oZnNtLCBuYW1lLCBmcm9tLCB0bywgYXJncykgeyByZXR1cm4gU3RhdGVNYWNoaW5lLmRvQ2FsbGJhY2soZnNtLCBmc21bJ29uYWZ0ZXJldmVudCddIHx8IGZzbVsnb25ldmVudCddLCAgICAgIG5hbWUsIGZyb20sIHRvLCBhcmdzKTsgfSxcbiAgICBsZWF2ZUFueVN0YXRlOiAgIGZ1bmN0aW9uKGZzbSwgbmFtZSwgZnJvbSwgdG8sIGFyZ3MpIHsgcmV0dXJuIFN0YXRlTWFjaGluZS5kb0NhbGxiYWNrKGZzbSwgZnNtWydvbmxlYXZlc3RhdGUnXSwgICAgICAgICAgICAgICAgICAgICAgICBuYW1lLCBmcm9tLCB0bywgYXJncyk7IH0sXG4gICAgZW50ZXJBbnlTdGF0ZTogICBmdW5jdGlvbihmc20sIG5hbWUsIGZyb20sIHRvLCBhcmdzKSB7IHJldHVybiBTdGF0ZU1hY2hpbmUuZG9DYWxsYmFjayhmc20sIGZzbVsnb25lbnRlcnN0YXRlJ10gfHwgZnNtWydvbnN0YXRlJ10sICAgICAgbmFtZSwgZnJvbSwgdG8sIGFyZ3MpOyB9LFxuICAgIGNoYW5nZVN0YXRlOiAgICAgZnVuY3Rpb24oZnNtLCBuYW1lLCBmcm9tLCB0bywgYXJncykgeyByZXR1cm4gU3RhdGVNYWNoaW5lLmRvQ2FsbGJhY2soZnNtLCBmc21bJ29uY2hhbmdlc3RhdGUnXSwgICAgICAgICAgICAgICAgICAgICAgIG5hbWUsIGZyb20sIHRvLCBhcmdzKTsgfSxcblxuICAgIGJlZm9yZVRoaXNFdmVudDogZnVuY3Rpb24oZnNtLCBuYW1lLCBmcm9tLCB0bywgYXJncykgeyByZXR1cm4gU3RhdGVNYWNoaW5lLmRvQ2FsbGJhY2soZnNtLCBmc21bJ29uYmVmb3JlJyArIG5hbWVdLCAgICAgICAgICAgICAgICAgICAgIG5hbWUsIGZyb20sIHRvLCBhcmdzKTsgfSxcbiAgICBhZnRlclRoaXNFdmVudDogIGZ1bmN0aW9uKGZzbSwgbmFtZSwgZnJvbSwgdG8sIGFyZ3MpIHsgcmV0dXJuIFN0YXRlTWFjaGluZS5kb0NhbGxiYWNrKGZzbSwgZnNtWydvbmFmdGVyJyAgKyBuYW1lXSB8fCBmc21bJ29uJyArIG5hbWVdLCBuYW1lLCBmcm9tLCB0bywgYXJncyk7IH0sXG4gICAgbGVhdmVUaGlzU3RhdGU6ICBmdW5jdGlvbihmc20sIG5hbWUsIGZyb20sIHRvLCBhcmdzKSB7IHJldHVybiBTdGF0ZU1hY2hpbmUuZG9DYWxsYmFjayhmc20sIGZzbVsnb25sZWF2ZScgICsgZnJvbV0sICAgICAgICAgICAgICAgICAgICAgbmFtZSwgZnJvbSwgdG8sIGFyZ3MpOyB9LFxuICAgIGVudGVyVGhpc1N0YXRlOiAgZnVuY3Rpb24oZnNtLCBuYW1lLCBmcm9tLCB0bywgYXJncykgeyByZXR1cm4gU3RhdGVNYWNoaW5lLmRvQ2FsbGJhY2soZnNtLCBmc21bJ29uZW50ZXInICArIHRvXSAgIHx8IGZzbVsnb24nICsgdG9dLCAgIG5hbWUsIGZyb20sIHRvLCBhcmdzKTsgfSxcblxuICAgIGJlZm9yZUV2ZW50OiBmdW5jdGlvbihmc20sIG5hbWUsIGZyb20sIHRvLCBhcmdzKSB7XG4gICAgICBpZiAoKGZhbHNlID09PSBTdGF0ZU1hY2hpbmUuYmVmb3JlVGhpc0V2ZW50KGZzbSwgbmFtZSwgZnJvbSwgdG8sIGFyZ3MpKSB8fFxuICAgICAgICAgIChmYWxzZSA9PT0gU3RhdGVNYWNoaW5lLmJlZm9yZUFueUV2ZW50KCBmc20sIG5hbWUsIGZyb20sIHRvLCBhcmdzKSkpXG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9LFxuXG4gICAgYWZ0ZXJFdmVudDogZnVuY3Rpb24oZnNtLCBuYW1lLCBmcm9tLCB0bywgYXJncykge1xuICAgICAgU3RhdGVNYWNoaW5lLmFmdGVyVGhpc0V2ZW50KGZzbSwgbmFtZSwgZnJvbSwgdG8sIGFyZ3MpO1xuICAgICAgU3RhdGVNYWNoaW5lLmFmdGVyQW55RXZlbnQoIGZzbSwgbmFtZSwgZnJvbSwgdG8sIGFyZ3MpO1xuICAgIH0sXG5cbiAgICBsZWF2ZVN0YXRlOiBmdW5jdGlvbihmc20sIG5hbWUsIGZyb20sIHRvLCBhcmdzKSB7XG4gICAgICB2YXIgc3BlY2lmaWMgPSBTdGF0ZU1hY2hpbmUubGVhdmVUaGlzU3RhdGUoZnNtLCBuYW1lLCBmcm9tLCB0bywgYXJncyksXG4gICAgICAgICAgZ2VuZXJhbCAgPSBTdGF0ZU1hY2hpbmUubGVhdmVBbnlTdGF0ZSggZnNtLCBuYW1lLCBmcm9tLCB0bywgYXJncyk7XG4gICAgICBpZiAoKGZhbHNlID09PSBzcGVjaWZpYykgfHwgKGZhbHNlID09PSBnZW5lcmFsKSlcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgZWxzZSBpZiAoKFN0YXRlTWFjaGluZS5BU1lOQyA9PT0gc3BlY2lmaWMpIHx8IChTdGF0ZU1hY2hpbmUuQVNZTkMgPT09IGdlbmVyYWwpKVxuICAgICAgICByZXR1cm4gU3RhdGVNYWNoaW5lLkFTWU5DO1xuICAgIH0sXG5cbiAgICBlbnRlclN0YXRlOiBmdW5jdGlvbihmc20sIG5hbWUsIGZyb20sIHRvLCBhcmdzKSB7XG4gICAgICBTdGF0ZU1hY2hpbmUuZW50ZXJUaGlzU3RhdGUoZnNtLCBuYW1lLCBmcm9tLCB0bywgYXJncyk7XG4gICAgICBTdGF0ZU1hY2hpbmUuZW50ZXJBbnlTdGF0ZSggZnNtLCBuYW1lLCBmcm9tLCB0bywgYXJncyk7XG4gICAgfSxcblxuICAgIC8vPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbiAgICBidWlsZEV2ZW50OiBmdW5jdGlvbihuYW1lLCBtYXApIHtcbiAgICAgIHJldHVybiBmdW5jdGlvbigpIHtcblxuICAgICAgICB2YXIgZnJvbSAgPSB0aGlzLmN1cnJlbnQ7XG4gICAgICAgIHZhciB0byAgICA9IG1hcFtmcm9tXSB8fCBtYXBbU3RhdGVNYWNoaW5lLldJTERDQVJEXSB8fCBmcm9tO1xuICAgICAgICB2YXIgYXJncyAgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpOyAvLyB0dXJuIGFyZ3VtZW50cyBpbnRvIHB1cmUgYXJyYXlcblxuICAgICAgICBpZiAodGhpcy50cmFuc2l0aW9uKVxuICAgICAgICAgIHJldHVybiB0aGlzLmVycm9yKG5hbWUsIGZyb20sIHRvLCBhcmdzLCBTdGF0ZU1hY2hpbmUuRXJyb3IuUEVORElOR19UUkFOU0lUSU9OLCBcImV2ZW50IFwiICsgbmFtZSArIFwiIGluYXBwcm9wcmlhdGUgYmVjYXVzZSBwcmV2aW91cyB0cmFuc2l0aW9uIGRpZCBub3QgY29tcGxldGVcIik7XG5cbiAgICAgICAgaWYgKHRoaXMuY2Fubm90KG5hbWUpKVxuICAgICAgICAgIHJldHVybiB0aGlzLmVycm9yKG5hbWUsIGZyb20sIHRvLCBhcmdzLCBTdGF0ZU1hY2hpbmUuRXJyb3IuSU5WQUxJRF9UUkFOU0lUSU9OLCBcImV2ZW50IFwiICsgbmFtZSArIFwiIGluYXBwcm9wcmlhdGUgaW4gY3VycmVudCBzdGF0ZSBcIiArIHRoaXMuY3VycmVudCk7XG5cbiAgICAgICAgaWYgKGZhbHNlID09PSBTdGF0ZU1hY2hpbmUuYmVmb3JlRXZlbnQodGhpcywgbmFtZSwgZnJvbSwgdG8sIGFyZ3MpKVxuICAgICAgICAgIHJldHVybiBTdGF0ZU1hY2hpbmUuUmVzdWx0LkNBTkNFTExFRDtcblxuICAgICAgICBpZiAoZnJvbSA9PT0gdG8pIHtcbiAgICAgICAgICBTdGF0ZU1hY2hpbmUuYWZ0ZXJFdmVudCh0aGlzLCBuYW1lLCBmcm9tLCB0bywgYXJncyk7XG4gICAgICAgICAgcmV0dXJuIFN0YXRlTWFjaGluZS5SZXN1bHQuTk9UUkFOU0lUSU9OO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gcHJlcGFyZSBhIHRyYW5zaXRpb24gbWV0aG9kIGZvciB1c2UgRUlUSEVSIGxvd2VyIGRvd24sIG9yIGJ5IGNhbGxlciBpZiB0aGV5IHdhbnQgYW4gYXN5bmMgdHJhbnNpdGlvbiAoaW5kaWNhdGVkIGJ5IGFuIEFTWU5DIHJldHVybiB2YWx1ZSBmcm9tIGxlYXZlU3RhdGUpXG4gICAgICAgIHZhciBmc20gPSB0aGlzO1xuICAgICAgICB0aGlzLnRyYW5zaXRpb24gPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICBmc20udHJhbnNpdGlvbiA9IG51bGw7IC8vIHRoaXMgbWV0aG9kIHNob3VsZCBvbmx5IGV2ZXIgYmUgY2FsbGVkIG9uY2VcbiAgICAgICAgICBmc20uY3VycmVudCA9IHRvO1xuICAgICAgICAgIFN0YXRlTWFjaGluZS5lbnRlclN0YXRlKCBmc20sIG5hbWUsIGZyb20sIHRvLCBhcmdzKTtcbiAgICAgICAgICBTdGF0ZU1hY2hpbmUuY2hhbmdlU3RhdGUoZnNtLCBuYW1lLCBmcm9tLCB0bywgYXJncyk7XG4gICAgICAgICAgU3RhdGVNYWNoaW5lLmFmdGVyRXZlbnQoIGZzbSwgbmFtZSwgZnJvbSwgdG8sIGFyZ3MpO1xuICAgICAgICAgIHJldHVybiBTdGF0ZU1hY2hpbmUuUmVzdWx0LlNVQ0NFRURFRDtcbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy50cmFuc2l0aW9uLmNhbmNlbCA9IGZ1bmN0aW9uKCkgeyAvLyBwcm92aWRlIGEgd2F5IGZvciBjYWxsZXIgdG8gY2FuY2VsIGFzeW5jIHRyYW5zaXRpb24gaWYgZGVzaXJlZCAoaXNzdWUgIzIyKVxuICAgICAgICAgIGZzbS50cmFuc2l0aW9uID0gbnVsbDtcbiAgICAgICAgICBTdGF0ZU1hY2hpbmUuYWZ0ZXJFdmVudChmc20sIG5hbWUsIGZyb20sIHRvLCBhcmdzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBsZWF2ZSA9IFN0YXRlTWFjaGluZS5sZWF2ZVN0YXRlKHRoaXMsIG5hbWUsIGZyb20sIHRvLCBhcmdzKTtcbiAgICAgICAgaWYgKGZhbHNlID09PSBsZWF2ZSkge1xuICAgICAgICAgIHRoaXMudHJhbnNpdGlvbiA9IG51bGw7XG4gICAgICAgICAgcmV0dXJuIFN0YXRlTWFjaGluZS5SZXN1bHQuQ0FOQ0VMTEVEO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKFN0YXRlTWFjaGluZS5BU1lOQyA9PT0gbGVhdmUpIHtcbiAgICAgICAgICByZXR1cm4gU3RhdGVNYWNoaW5lLlJlc3VsdC5QRU5ESU5HO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgIGlmICh0aGlzLnRyYW5zaXRpb24pIC8vIG5lZWQgdG8gY2hlY2sgaW4gY2FzZSB1c2VyIG1hbnVhbGx5IGNhbGxlZCB0cmFuc2l0aW9uKCkgYnV0IGZvcmdvdCB0byByZXR1cm4gU3RhdGVNYWNoaW5lLkFTWU5DXG4gICAgICAgICAgICByZXR1cm4gdGhpcy50cmFuc2l0aW9uKCk7XG4gICAgICAgIH1cblxuICAgICAgfTtcbiAgICB9XG5cbiAgfTsgLy8gU3RhdGVNYWNoaW5lXG5cbiAgLy89PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuICAvLz09PT09PVxuICAvLyBOT0RFXG4gIC8vPT09PT09XG4gIGlmICh0eXBlb2YgZXhwb3J0cyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICBpZiAodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcgJiYgbW9kdWxlLmV4cG9ydHMpIHtcbiAgICAgIGV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IFN0YXRlTWFjaGluZTtcbiAgICB9XG4gICAgZXhwb3J0cy5TdGF0ZU1hY2hpbmUgPSBTdGF0ZU1hY2hpbmU7XG4gIH1cbiAgLy89PT09PT09PT09PT1cbiAgLy8gQU1EL1JFUVVJUkVcbiAgLy89PT09PT09PT09PT1cbiAgZWxzZSBpZiAodHlwZW9mIGRlZmluZSA9PT0gJ2Z1bmN0aW9uJyAmJiBkZWZpbmUuYW1kKSB7XG4gICAgZGVmaW5lKGZ1bmN0aW9uKHJlcXVpcmUpIHsgcmV0dXJuIFN0YXRlTWFjaGluZTsgfSk7XG4gIH1cbiAgLy89PT09PT09PVxuICAvLyBCUk9XU0VSXG4gIC8vPT09PT09PT1cbiAgZWxzZSBpZiAodHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICB3aW5kb3cuU3RhdGVNYWNoaW5lID0gU3RhdGVNYWNoaW5lO1xuICB9XG4gIC8vPT09PT09PT09PT1cbiAgLy8gV0VCIFdPUktFUlxuICAvLz09PT09PT09PT09XG4gIGVsc2UgaWYgKHR5cGVvZiBzZWxmICE9PSAndW5kZWZpbmVkJykge1xuICAgIHNlbGYuU3RhdGVNYWNoaW5lID0gU3RhdGVNYWNoaW5lO1xuICB9XG5cbn0oKSk7XG4iLCIvKlxyXG4qIGxvZ2xldmVsIC0gaHR0cHM6Ly9naXRodWIuY29tL3BpbXRlcnJ5L2xvZ2xldmVsXHJcbipcclxuKiBDb3B5cmlnaHQgKGMpIDIwMTMgVGltIFBlcnJ5XHJcbiogTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBsaWNlbnNlLlxyXG4qL1xyXG4oZnVuY3Rpb24gKHJvb3QsIGRlZmluaXRpb24pIHtcclxuICAgIFwidXNlIHN0cmljdFwiO1xyXG4gICAgaWYgKHR5cGVvZiBtb2R1bGUgPT09ICdvYmplY3QnICYmIG1vZHVsZS5leHBvcnRzICYmIHR5cGVvZiByZXF1aXJlID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgbW9kdWxlLmV4cG9ydHMgPSBkZWZpbml0aW9uKCk7XHJcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBkZWZpbmUgPT09ICdmdW5jdGlvbicgJiYgdHlwZW9mIGRlZmluZS5hbWQgPT09ICdvYmplY3QnKSB7XHJcbiAgICAgICAgZGVmaW5lKGRlZmluaXRpb24pO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICByb290LmxvZyA9IGRlZmluaXRpb24oKTtcclxuICAgIH1cclxufSh0aGlzLCBmdW5jdGlvbiAoKSB7XHJcbiAgICBcInVzZSBzdHJpY3RcIjtcclxuICAgIHZhciBub29wID0gZnVuY3Rpb24oKSB7fTtcclxuICAgIHZhciB1bmRlZmluZWRUeXBlID0gXCJ1bmRlZmluZWRcIjtcclxuXHJcbiAgICBmdW5jdGlvbiByZWFsTWV0aG9kKG1ldGhvZE5hbWUpIHtcclxuICAgICAgICBpZiAodHlwZW9mIGNvbnNvbGUgPT09IHVuZGVmaW5lZFR5cGUpIHtcclxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlOyAvLyBXZSBjYW4ndCBidWlsZCBhIHJlYWwgbWV0aG9kIHdpdGhvdXQgYSBjb25zb2xlIHRvIGxvZyB0b1xyXG4gICAgICAgIH0gZWxzZSBpZiAoY29uc29sZVttZXRob2ROYW1lXSAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBiaW5kTWV0aG9kKGNvbnNvbGUsIG1ldGhvZE5hbWUpO1xyXG4gICAgICAgIH0gZWxzZSBpZiAoY29uc29sZS5sb2cgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICByZXR1cm4gYmluZE1ldGhvZChjb25zb2xlLCAnbG9nJyk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgcmV0dXJuIG5vb3A7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGJpbmRNZXRob2Qob2JqLCBtZXRob2ROYW1lKSB7XHJcbiAgICAgICAgdmFyIG1ldGhvZCA9IG9ialttZXRob2ROYW1lXTtcclxuICAgICAgICBpZiAodHlwZW9mIG1ldGhvZC5iaW5kID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBtZXRob2QuYmluZChvYmopO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gRnVuY3Rpb24ucHJvdG90eXBlLmJpbmQuY2FsbChtZXRob2QsIG9iaik7XHJcbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcclxuICAgICAgICAgICAgICAgIC8vIE1pc3NpbmcgYmluZCBzaGltIG9yIElFOCArIE1vZGVybml6ciwgZmFsbGJhY2sgdG8gd3JhcHBpbmdcclxuICAgICAgICAgICAgICAgIHJldHVybiBmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gRnVuY3Rpb24ucHJvdG90eXBlLmFwcGx5LmFwcGx5KG1ldGhvZCwgW29iaiwgYXJndW1lbnRzXSk7XHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIHRoZXNlIHByaXZhdGUgZnVuY3Rpb25zIGFsd2F5cyBuZWVkIGB0aGlzYCB0byBiZSBzZXQgcHJvcGVybHlcclxuXHJcbiAgICBmdW5jdGlvbiBlbmFibGVMb2dnaW5nV2hlbkNvbnNvbGVBcnJpdmVzKG1ldGhvZE5hbWUsIGxldmVsLCBsb2dnZXJOYW1lKSB7XHJcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgaWYgKHR5cGVvZiBjb25zb2xlICE9PSB1bmRlZmluZWRUeXBlKSB7XHJcbiAgICAgICAgICAgICAgICByZXBsYWNlTG9nZ2luZ01ldGhvZHMuY2FsbCh0aGlzLCBsZXZlbCwgbG9nZ2VyTmFtZSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzW21ldGhvZE5hbWVdLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9O1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIHJlcGxhY2VMb2dnaW5nTWV0aG9kcyhsZXZlbCwgbG9nZ2VyTmFtZSkge1xyXG4gICAgICAgIC8qanNoaW50IHZhbGlkdGhpczp0cnVlICovXHJcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsb2dNZXRob2RzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgIHZhciBtZXRob2ROYW1lID0gbG9nTWV0aG9kc1tpXTtcclxuICAgICAgICAgICAgdGhpc1ttZXRob2ROYW1lXSA9IChpIDwgbGV2ZWwpID9cclxuICAgICAgICAgICAgICAgIG5vb3AgOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5tZXRob2RGYWN0b3J5KG1ldGhvZE5hbWUsIGxldmVsLCBsb2dnZXJOYW1lKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gZGVmYXVsdE1ldGhvZEZhY3RvcnkobWV0aG9kTmFtZSwgbGV2ZWwsIGxvZ2dlck5hbWUpIHtcclxuICAgICAgICAvKmpzaGludCB2YWxpZHRoaXM6dHJ1ZSAqL1xyXG4gICAgICAgIHJldHVybiByZWFsTWV0aG9kKG1ldGhvZE5hbWUpIHx8XHJcbiAgICAgICAgICAgICAgIGVuYWJsZUxvZ2dpbmdXaGVuQ29uc29sZUFycml2ZXMuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcclxuICAgIH1cclxuXHJcbiAgICB2YXIgbG9nTWV0aG9kcyA9IFtcclxuICAgICAgICBcInRyYWNlXCIsXHJcbiAgICAgICAgXCJkZWJ1Z1wiLFxyXG4gICAgICAgIFwiaW5mb1wiLFxyXG4gICAgICAgIFwid2FyblwiLFxyXG4gICAgICAgIFwiZXJyb3JcIlxyXG4gICAgXTtcclxuXHJcbiAgICBmdW5jdGlvbiBMb2dnZXIobmFtZSwgZGVmYXVsdExldmVsLCBmYWN0b3J5KSB7XHJcbiAgICAgIHZhciBzZWxmID0gdGhpcztcclxuICAgICAgdmFyIGN1cnJlbnRMZXZlbDtcclxuICAgICAgdmFyIHN0b3JhZ2VLZXkgPSBcImxvZ2xldmVsXCI7XHJcbiAgICAgIGlmIChuYW1lKSB7XHJcbiAgICAgICAgc3RvcmFnZUtleSArPSBcIjpcIiArIG5hbWU7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGZ1bmN0aW9uIHBlcnNpc3RMZXZlbElmUG9zc2libGUobGV2ZWxOdW0pIHtcclxuICAgICAgICAgIHZhciBsZXZlbE5hbWUgPSAobG9nTWV0aG9kc1tsZXZlbE51bV0gfHwgJ3NpbGVudCcpLnRvVXBwZXJDYXNlKCk7XHJcblxyXG4gICAgICAgICAgLy8gVXNlIGxvY2FsU3RvcmFnZSBpZiBhdmFpbGFibGVcclxuICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgd2luZG93LmxvY2FsU3RvcmFnZVtzdG9yYWdlS2V5XSA9IGxldmVsTmFtZTtcclxuICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICB9IGNhdGNoIChpZ25vcmUpIHt9XHJcblxyXG4gICAgICAgICAgLy8gVXNlIHNlc3Npb24gY29va2llIGFzIGZhbGxiYWNrXHJcbiAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgIHdpbmRvdy5kb2N1bWVudC5jb29raWUgPVxyXG4gICAgICAgICAgICAgICAgZW5jb2RlVVJJQ29tcG9uZW50KHN0b3JhZ2VLZXkpICsgXCI9XCIgKyBsZXZlbE5hbWUgKyBcIjtcIjtcclxuICAgICAgICAgIH0gY2F0Y2ggKGlnbm9yZSkge31cclxuICAgICAgfVxyXG5cclxuICAgICAgZnVuY3Rpb24gZ2V0UGVyc2lzdGVkTGV2ZWwoKSB7XHJcbiAgICAgICAgICB2YXIgc3RvcmVkTGV2ZWw7XHJcblxyXG4gICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICBzdG9yZWRMZXZlbCA9IHdpbmRvdy5sb2NhbFN0b3JhZ2Vbc3RvcmFnZUtleV07XHJcbiAgICAgICAgICB9IGNhdGNoIChpZ25vcmUpIHt9XHJcblxyXG4gICAgICAgICAgaWYgKHR5cGVvZiBzdG9yZWRMZXZlbCA9PT0gdW5kZWZpbmVkVHlwZSkge1xyXG4gICAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICAgIHZhciBjb29raWUgPSB3aW5kb3cuZG9jdW1lbnQuY29va2llO1xyXG4gICAgICAgICAgICAgICAgICB2YXIgbG9jYXRpb24gPSBjb29raWUuaW5kZXhPZihcclxuICAgICAgICAgICAgICAgICAgICAgIGVuY29kZVVSSUNvbXBvbmVudChzdG9yYWdlS2V5KSArIFwiPVwiKTtcclxuICAgICAgICAgICAgICAgICAgaWYgKGxvY2F0aW9uKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICBzdG9yZWRMZXZlbCA9IC9eKFteO10rKS8uZXhlYyhjb29raWUuc2xpY2UobG9jYXRpb24pKVsxXTtcclxuICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgIH0gY2F0Y2ggKGlnbm9yZSkge31cclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAvLyBJZiB0aGUgc3RvcmVkIGxldmVsIGlzIG5vdCB2YWxpZCwgdHJlYXQgaXQgYXMgaWYgbm90aGluZyB3YXMgc3RvcmVkLlxyXG4gICAgICAgICAgaWYgKHNlbGYubGV2ZWxzW3N0b3JlZExldmVsXSA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgICAgc3RvcmVkTGV2ZWwgPSB1bmRlZmluZWQ7XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgcmV0dXJuIHN0b3JlZExldmVsO1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvKlxyXG4gICAgICAgKlxyXG4gICAgICAgKiBQdWJsaWMgQVBJXHJcbiAgICAgICAqXHJcbiAgICAgICAqL1xyXG5cclxuICAgICAgc2VsZi5sZXZlbHMgPSB7IFwiVFJBQ0VcIjogMCwgXCJERUJVR1wiOiAxLCBcIklORk9cIjogMiwgXCJXQVJOXCI6IDMsXHJcbiAgICAgICAgICBcIkVSUk9SXCI6IDQsIFwiU0lMRU5UXCI6IDV9O1xyXG5cclxuICAgICAgc2VsZi5tZXRob2RGYWN0b3J5ID0gZmFjdG9yeSB8fCBkZWZhdWx0TWV0aG9kRmFjdG9yeTtcclxuXHJcbiAgICAgIHNlbGYuZ2V0TGV2ZWwgPSBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICByZXR1cm4gY3VycmVudExldmVsO1xyXG4gICAgICB9O1xyXG5cclxuICAgICAgc2VsZi5zZXRMZXZlbCA9IGZ1bmN0aW9uIChsZXZlbCwgcGVyc2lzdCkge1xyXG4gICAgICAgICAgaWYgKHR5cGVvZiBsZXZlbCA9PT0gXCJzdHJpbmdcIiAmJiBzZWxmLmxldmVsc1tsZXZlbC50b1VwcGVyQ2FzZSgpXSAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgICAgbGV2ZWwgPSBzZWxmLmxldmVsc1tsZXZlbC50b1VwcGVyQ2FzZSgpXTtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIGlmICh0eXBlb2YgbGV2ZWwgPT09IFwibnVtYmVyXCIgJiYgbGV2ZWwgPj0gMCAmJiBsZXZlbCA8PSBzZWxmLmxldmVscy5TSUxFTlQpIHtcclxuICAgICAgICAgICAgICBjdXJyZW50TGV2ZWwgPSBsZXZlbDtcclxuICAgICAgICAgICAgICBpZiAocGVyc2lzdCAhPT0gZmFsc2UpIHsgIC8vIGRlZmF1bHRzIHRvIHRydWVcclxuICAgICAgICAgICAgICAgICAgcGVyc2lzdExldmVsSWZQb3NzaWJsZShsZXZlbCk7XHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgIHJlcGxhY2VMb2dnaW5nTWV0aG9kcy5jYWxsKHNlbGYsIGxldmVsLCBuYW1lKTtcclxuICAgICAgICAgICAgICBpZiAodHlwZW9mIGNvbnNvbGUgPT09IHVuZGVmaW5lZFR5cGUgJiYgbGV2ZWwgPCBzZWxmLmxldmVscy5TSUxFTlQpIHtcclxuICAgICAgICAgICAgICAgICAgcmV0dXJuIFwiTm8gY29uc29sZSBhdmFpbGFibGUgZm9yIGxvZ2dpbmdcIjtcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgIHRocm93IFwibG9nLnNldExldmVsKCkgY2FsbGVkIHdpdGggaW52YWxpZCBsZXZlbDogXCIgKyBsZXZlbDtcclxuICAgICAgICAgIH1cclxuICAgICAgfTtcclxuXHJcbiAgICAgIHNlbGYuc2V0RGVmYXVsdExldmVsID0gZnVuY3Rpb24gKGxldmVsKSB7XHJcbiAgICAgICAgICBpZiAoIWdldFBlcnNpc3RlZExldmVsKCkpIHtcclxuICAgICAgICAgICAgICBzZWxmLnNldExldmVsKGxldmVsLCBmYWxzZSk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgIH07XHJcblxyXG4gICAgICBzZWxmLmVuYWJsZUFsbCA9IGZ1bmN0aW9uKHBlcnNpc3QpIHtcclxuICAgICAgICAgIHNlbGYuc2V0TGV2ZWwoc2VsZi5sZXZlbHMuVFJBQ0UsIHBlcnNpc3QpO1xyXG4gICAgICB9O1xyXG5cclxuICAgICAgc2VsZi5kaXNhYmxlQWxsID0gZnVuY3Rpb24ocGVyc2lzdCkge1xyXG4gICAgICAgICAgc2VsZi5zZXRMZXZlbChzZWxmLmxldmVscy5TSUxFTlQsIHBlcnNpc3QpO1xyXG4gICAgICB9O1xyXG5cclxuICAgICAgLy8gSW5pdGlhbGl6ZSB3aXRoIHRoZSByaWdodCBsZXZlbFxyXG4gICAgICB2YXIgaW5pdGlhbExldmVsID0gZ2V0UGVyc2lzdGVkTGV2ZWwoKTtcclxuICAgICAgaWYgKGluaXRpYWxMZXZlbCA9PSBudWxsKSB7XHJcbiAgICAgICAgICBpbml0aWFsTGV2ZWwgPSBkZWZhdWx0TGV2ZWwgPT0gbnVsbCA/IFwiV0FSTlwiIDogZGVmYXVsdExldmVsO1xyXG4gICAgICB9XHJcbiAgICAgIHNlbGYuc2V0TGV2ZWwoaW5pdGlhbExldmVsLCBmYWxzZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLypcclxuICAgICAqXHJcbiAgICAgKiBQYWNrYWdlLWxldmVsIEFQSVxyXG4gICAgICpcclxuICAgICAqL1xyXG5cclxuICAgIHZhciBkZWZhdWx0TG9nZ2VyID0gbmV3IExvZ2dlcigpO1xyXG5cclxuICAgIHZhciBfbG9nZ2Vyc0J5TmFtZSA9IHt9O1xyXG4gICAgZGVmYXVsdExvZ2dlci5nZXRMb2dnZXIgPSBmdW5jdGlvbiBnZXRMb2dnZXIobmFtZSkge1xyXG4gICAgICAgIGlmICh0eXBlb2YgbmFtZSAhPT0gXCJzdHJpbmdcIiB8fCBuYW1lID09PSBcIlwiKSB7XHJcbiAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwiWW91IG11c3Qgc3VwcGx5IGEgbmFtZSB3aGVuIGNyZWF0aW5nIGEgbG9nZ2VyLlwiKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHZhciBsb2dnZXIgPSBfbG9nZ2Vyc0J5TmFtZVtuYW1lXTtcclxuICAgICAgICBpZiAoIWxvZ2dlcikge1xyXG4gICAgICAgICAgbG9nZ2VyID0gX2xvZ2dlcnNCeU5hbWVbbmFtZV0gPSBuZXcgTG9nZ2VyKFxyXG4gICAgICAgICAgICBuYW1lLCBkZWZhdWx0TG9nZ2VyLmdldExldmVsKCksIGRlZmF1bHRMb2dnZXIubWV0aG9kRmFjdG9yeSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBsb2dnZXI7XHJcbiAgICB9O1xyXG5cclxuICAgIC8vIEdyYWIgdGhlIGN1cnJlbnQgZ2xvYmFsIGxvZyB2YXJpYWJsZSBpbiBjYXNlIG9mIG92ZXJ3cml0ZVxyXG4gICAgdmFyIF9sb2cgPSAodHlwZW9mIHdpbmRvdyAhPT0gdW5kZWZpbmVkVHlwZSkgPyB3aW5kb3cubG9nIDogdW5kZWZpbmVkO1xyXG4gICAgZGVmYXVsdExvZ2dlci5ub0NvbmZsaWN0ID0gZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgaWYgKHR5cGVvZiB3aW5kb3cgIT09IHVuZGVmaW5lZFR5cGUgJiZcclxuICAgICAgICAgICAgICAgd2luZG93LmxvZyA9PT0gZGVmYXVsdExvZ2dlcikge1xyXG4gICAgICAgICAgICB3aW5kb3cubG9nID0gX2xvZztcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiBkZWZhdWx0TG9nZ2VyO1xyXG4gICAgfTtcclxuXHJcbiAgICByZXR1cm4gZGVmYXVsdExvZ2dlcjtcclxufSkpO1xyXG4iLCJsZXQgJCA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93WyckJ10gOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsWyckJ10gOiBudWxsKTtcclxubGV0IF8gPSAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvd1snXyddIDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbFsnXyddIDogbnVsbCk7XHJcblxyXG5sZXQgY29uc3RhbnRzID0gcmVxdWlyZSgnLi9jb25zdC5qcycpO1xyXG5sZXQgUGx1bmRlcmFibGVWaWxsYWdlID0gcmVxdWlyZShcIi4vZGF0YS9wbHVuZGVyYWJsZS12aWxsYWdlXCIpO1xyXG5sZXQgQm90T3JkZXIgPSByZXF1aXJlKFwiLi9kYXRhL2JvdC1vcmRlci5qc1wiKTtcclxubGV0IG1pbmVyID0gcmVxdWlyZShcIi4vbWluZXJcIik7XHJcbmxldCB1dGlsID0gcmVxdWlyZShcIi4vdXRpbFwiKTtcclxubGV0IHNldHRpbmdzID0gcmVxdWlyZShcIi4vc2V0dGluZ3NcIik7XHJcblxyXG5mdW5jdGlvbiBoYXNFbm91Z3RoVW5pdHMgKHVuaXRzKSB7XHJcbiAgXCJ1c2Ugc3RyaWN0O1wiXHJcbiAgICBcclxuICBsZXQgY3VycmVudF91bml0cyA9IG1pbmVyLm1pbmVDdXJyZW50VW5pdHMoKTtcclxuICBcclxuICBmb3IgKGxldCB1bml0X25hbWUgaW4gdW5pdHMpIHtcclxuICAgIGlmKGN1cnJlbnRfdW5pdHNbdW5pdF9uYW1lXSA8IHVuaXRzW3VuaXRfbmFtZV0pIHtcclxuICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG4gIH1cclxuICBcclxuICByZXR1cm4gdHJ1ZTtcclxufVxyXG5cclxuXHJcbmV4cG9ydHMuY3JlYXRlT3JkZXJzID0gZnVuY3Rpb24gKHBsdW5kZXJhYmxlX3ZpbGxhZ2VzKSB7XHJcbiAgXCJ1c2Ugc3RyaWN0O1wiXHJcbiAgXHJcbiAgbGV0IG9yZGVycyA9IFtdO1xyXG4gIGxldCBib3Rfc2V0dGluZ3MgPSBzZXR0aW5ncy5Cb3RTZXR0aW5ncztcclxuICBcclxuICBmb3IgKGxldCBpID0gMDsgaSA8IHBsdW5kZXJhYmxlX3ZpbGxhZ2VzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICBsZXQgcHYgPSBwbHVuZGVyYWJsZV92aWxsYWdlc1tpXTtcclxuICAgIFxyXG4gICAgaWYoIXB2LmlzX2F0dGFja2luZykge1xyXG4gICAgICAvKiBOb3QgYWxyZWFkeSBhdHRhY2tpbmcgKi9cclxuICAgICAgICAgICAgXHJcbiAgICAgIGlmKHB2LndhbGwgPiAwKSB7IC8qIEhhcyBXYWxsICovXHJcbiAgICAgICAgLy8gU2VuZCBhIGhpZ2ggcHJpb3JpdHkgYXR0YWNrIHdpdGggMTAgbGlndGggY2F2LCAxIHNweSwgYW5kIG4gcmFtc1xyXG4gICAgICAgIGxldCB1bml0cyA9IF8uY2xvbmUoYm90X3NldHRpbmdzLlJBTV9VTklUUyk7XHJcbiAgICAgICAgdW5pdHMucmFtID0gYm90X3NldHRpbmdzLlJBTVNfUEVSX1dBTExfTEVWRUxbcHYud2FsbF07IFxyXG4gICAgICAgIG9yZGVycy5wdXNoKG5ldyBCb3RPcmRlci5DdXN0b21PcmRlcihwdiwgdW5pdHMsIC0xMDApKTtcclxuICAgICAgICBcclxuICAgICAgfSBlbHNlIGlmKHB2LmdldFRvdGFsUmVzKCkgPj0gYm90X3NldHRpbmdzLk1JTl9SRVMpIHtcclxuICAgICAgICAvKiBEb2Vzbid0IGhhdmUgd2FsbHMgJiYgSGFzIHJlc291cmNlcyAqL1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChwdi5kaXN0YW5jZSA8PSBib3Rfc2V0dGluZ3MuTUFYX0RJU1QpIHtcclxuICAgICAgICAgIGlmKHB2LmdldFRvdGFsUmVzKCkgPj0gYm90X3NldHRpbmdzLk1BWF9SRVMpIHtcclxuICAgICAgICAgICAgb3JkZXJzLnB1c2gobmV3IEJvdE9yZGVyLlRlbXBsYXRlT3JkZXIocHYsIGJvdF9zZXR0aW5ncy5NQVhfVEVNUExBVEUsIDApKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBvcmRlcnMucHVzaChuZXcgQm90T3JkZXIuVGVtcGxhdGVPcmRlcihwdiwgXCJDXCIsIDApKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgIH0gXHJcbiAgICB9XHJcbiAgfVxyXG4gICAgXHJcbiAgcmV0dXJuIG9yZGVycztcclxufVxyXG5cclxuZnVuY3Rpb24gcnVuRm5zRXZlcnlJbnRlcnZhbCAob3JkZXJzLCBtcykge1xyXG4gIFwidXNlIHN0cmljdFwiO1xyXG4gIFxyXG4gIGNvbnN0IE9SREVSU19FWEVDVVRJT05fTUlOX0lOVEVSVkFMID0gMjUwO1xyXG4gIGNvbnN0IE9SREVSU19FWEVDVVRJT05fTUFYX0lOVEVSVkFMID0gNjAwMDA7XHJcbiAgXHJcbiAgbXMgPSBNYXRoLm1pbihNYXRoLm1heChtcywgT1JERVJTX0VYRUNVVElPTl9NSU5fSU5URVJWQUwpLCBPUkRFUlNfRVhFQ1VUSU9OX01BWF9JTlRFUlZBTCk7XHJcbiAgXHJcbiAgbGV0IG9yZGVyc19mbnMgPSBfLm1hcChvcmRlcnMsIG8gPT4gXy5iaW5kKG8uZXhlY3V0ZSwgbykpO1xyXG4gIHV0aWwubWF5YmVSdW5GbnMob3JkZXJzX2ZucywgMSwgbXMpOyAgICBcclxufVxyXG5cclxuZnVuY3Rpb24gZGVsYXkoaW50ZXJ2YWwpIHtcclxuICAgIHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlKSB7XHJcbiAgICAgICAgc2V0VGltZW91dChyZXNvbHZlLCBpbnRlcnZhbCk7XHJcbiAgICB9KTtcclxufVxyXG5cclxuZXhwb3J0cy5leGVjdXRlID0gZnVuY3Rpb24gKCkge1xyXG4gIFwidXNlIHN0cmljdFwiO1xyXG4gICAgXHJcbiAgLy8gR2F0aGVyIHZpbGxhZ2VzIGluZm9cclxuICBsZXQgcGx1bmRlcmFibGVfdmlsbGFnZXMgPSBtaW5lci5taW5lUGx1bmRlclZpbGxhZ2VzKCk7XHJcbiAgXHJcbiAgLy8gQ3JlYXRlIG9yZGVyc1xyXG4gIGxldCBvcmRlcnMgPSBleHBvcnRzLmNyZWF0ZU9yZGVycyhwbHVuZGVyYWJsZV92aWxsYWdlcyk7XHJcbiAgb3JkZXJzID0gXy5zb3J0QnlBbGwob3JkZXJzLCAncHJpb3JpdHknKTsgLy8gU29ydCBieSBoaWdoZXIgcHJpb3JpdHlcclxuICBcclxuICAvKiBFeGVjdXRlIG9yZGVycyAqL1xyXG4gIGxldCBwcm9ncmVzc19iYXIgPSAkKFwiI1RXRkFQLXByb2dyZXNzLWV4ZWN1dGlvblwiKTtcclxuICBsZXQgZXhlY3V0ZV9wcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKCk7XHJcbiAgXHJcbiAgLy8gQ2xlYXIgcHJvZ3Jlc3NiYXJcclxuICBwcm9ncmVzc19iYXIuYXR0cihcIm1heFwiLCBvcmRlcnMubGVuZ3RoKTtcclxuICBwcm9ncmVzc19iYXIudmFsKDApO1xyXG4gIFxyXG4gIC8vIENyZWF0ZSBwcm9taXNlXHJcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBvcmRlcnMubGVuZ3RoOyBpKyspIHtcclxuICAgIGxldCBvcmRlciA9IG9yZGVyc1tpXTtcclxuICAgIFxyXG4gICAgZXhlY3V0ZV9wcm9taXNlID0gZXhlY3V0ZV9wcm9taXNlLnRoZW4oKCkgPT4ge1xyXG4gICAgICBwcm9ncmVzc19iYXIudmFsKHByb2dyZXNzX2Jhci52YWwoKSArIDEpO1xyXG4gICAgICByZXR1cm4gb3JkZXIuZXhlY3V0ZSgpID8gZGVsYXkoNTAwKSA6IG51bGw7XHJcbiAgICB9KTtcclxuICB9XHJcbiAgXHJcbiAgZXhlY3V0ZV9wcm9taXNlID0gZXhlY3V0ZV9wcm9taXNlLmNhdGNoKGNvbnNvbGUuZXJyb3IuYmluZChjb25zb2xlKSk7XHJcbiAgXHJcbiAgcmV0dXJuIGV4ZWN1dGVfcHJvbWlzZTtcclxufVxyXG5cclxuZnVuY3Rpb24gY2xlYXJTaW11bGF0aW9uKCkge1xyXG4gIFwidXNlIHN0cmljdFwiO1xyXG4gIFxyXG4gICQoXCIuXCIgKyBjb25zdGFudHMuU0lNVUxBVElPTl9CVE5fQ0xBU1MpXHJcbiAgICAuZWFjaCgoaSwgZSkgPT4gJChlKS5yZW1vdmVDbGFzcyhjb25zdGFudHMuU0lNVUxBVElPTl9CVE5fQ0xBU1MpKTtcclxufVxyXG5leHBvcnRzLmNsZWFyU2ltdWxhdGlvbiA9IGNsZWFyU2ltdWxhdGlvbjtcclxuXHJcbmV4cG9ydHMuc2ltdWxhdGUgPSBmdW5jdGlvbiAoKSB7XHJcbiAgXCJ1c2Ugc3RyaWN0XCI7XHJcbiAgXHJcbiAgLy8gUmVtb3ZlIHByZXZpb3VzIHNpbXVsYXRpb25cclxuICBjbGVhclNpbXVsYXRpb24oKTtcclxuICAgIFxyXG4gIC8vIEdhdGhlciB2aWxsYWdlcyBpbmZvXHJcbiAgbGV0IHBsdW5kZXJhYmxlX3ZpbGxhZ2VzID0gbWluZXIubWluZVBsdW5kZXJWaWxsYWdlcygpO1xyXG4gIFxyXG4gIC8vIENyZWF0ZSBvcmRlcnNcclxuICBsZXQgb3JkZXJzID0gZXhwb3J0cy5jcmVhdGVPcmRlcnMocGx1bmRlcmFibGVfdmlsbGFnZXMpO1xyXG4gIG9yZGVycyA9IF8uc29ydEJ5QWxsKG9yZGVycywgJ3ByaW9yaXR5Jyk7IC8vIFNvcnQgYnkgaGlnaGVyIHByaW9yaXR5XHJcbiAgXHJcbiAgLy8gRHJhdyBzaW11bGF0aW9uXHJcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBvcmRlcnMubGVuZ3RoOyBpKyspIHtcclxuICAgIG9yZGVyc1tpXS5zaW11bGF0ZSgpO1xyXG4gIH1cclxufSIsIm1vZHVsZS5leHBvcnRzID0ge1xyXG4gIC8qKiogU2V0dGluZ3MgKioqL1xyXG4gIERFRkFVTFRfU0VUVElOR1MgOiB7XHJcbiAgICAvLyBEZWZhdWx0c1xyXG4gICAgQm90U2V0dGluZ3MgOiB7XHJcbiAgICAgIE1JTl9SRVMgOiAyNTAsXHJcbiAgICAgIE1BWF9SRVMgOiAxMDAwLFxyXG4gICAgICBNQVhfVEVNUExBVEUgOiBcIkFcIixcclxuICAgICAgVEhSRVNIT0xEX0RJU1QgOiA2LFxyXG4gICAgICBNQVhfRElTVCA6IDE1LFxyXG4gICAgICBSQU1fVU5JVFMgOiB7IHNweToxLCBzcGVhcjoyNSwgc3dvcmQ6NTAgfSxcclxuICAgICAgUkFNU19QRVJfV0FMTF9MRVZFTCA6IFswLCAyLCA0LCA3LCAxMSwgMTUsIDIwLCAyNiwgMzMsIDQyLCA1MV1cclxuICAgIH0sXHJcbiAgICBcclxuICAgIGVudiA6IFwicHJvZFwiLFxyXG4gIH0sXHJcbiAgXHJcbiAgLyoqKiBVSSAqKiovXHJcbiAgU0lNVUxBVElPTl9CVE5fQ0xBU1MgOiBcIlRXRkFQLWJ0bi1zaW11bGF0aW9uXCIsXHJcbn07IiwiLyogZ2xvYmFsIFVJICovXHJcbi8qIGdsb2JhbCBUcmliYWxXYXJzICovXHJcblxyXG5sZXQgJCA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93WyckJ10gOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsWyckJ10gOiBudWxsKTtcclxubGV0IF8gPSAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvd1snXyddIDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbFsnXyddIDogbnVsbCk7XHJcbmxldCBsb2cgPSByZXF1aXJlKCdsb2dsZXZlbCcpLmdldExvZ2dlcihcIkJvdE9yZGVyXCIpO1xyXG5cclxubGV0IGNvbnN0YW50cyA9IHJlcXVpcmUoJy4vLi4vY29uc3QuanMnKTtcclxubGV0IG1pbmVyID0gcmVxdWlyZShcIi4vLi4vbWluZXJcIik7XHJcbmxldCB1dGlsID0gcmVxdWlyZShcIi4vLi4vdXRpbFwiKTtcclxuXHJcblxyXG5jbGFzcyBPcmRlciB7XHJcbiAgY29uc3RydWN0b3IgKHBsdW5kZXJhYmxlX3ZpbGxhZ2UsIHByaW9yaXR5KSB7ICAgIFxyXG4gICAgdGhpcy5wbHVuZGVyYWJsZV92aWxsYWdlID0gcGx1bmRlcmFibGVfdmlsbGFnZTtcclxuICAgIHRoaXMucHJpb3JpdHkgPSBwcmlvcml0eTtcclxuICB9XHJcbiAgXHJcbiAgZ2V0IG9yZGVyX2J1dHRvbiAoKSB7XHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ05vdCBpbXBsZW1lbnRlZC4nKTtcclxuICB9XHJcbiAgXHJcbiAgZXhlY3V0ZSAoKSB7IDsgfVxyXG4gIFxyXG4gIHNpbXVsYXRlICgpIHsgOyB9XHJcbiAgXHJcbiAgZ2V0IHVuaXRzICgpIHsgdGhyb3cgRXJyb3IoXCJOb3QgaW5wbGVtZW50ZWQuXCIpOyB9XHJcbiAgXHJcbiAgaGFzRW5vdWdoVW5pdHMgKCkgeyBcclxuICAgIHJldHVybiAhXy5pc0VtcHR5KHRoaXMudW5pdHMpICYmIHV0aWwuaGFzRW5vdWdoVW5pdHModGhpcy51bml0cyk7XHJcbiAgfVxyXG59XHJcbmV4cG9ydHMuT3JkZXIgPSBPcmRlcjtcclxuXHJcblxyXG5cclxuY2xhc3MgVGVtcGxhdGVPcmRlciBleHRlbmRzIE9yZGVyIHtcclxuICBjb25zdHJ1Y3RvciAocGx1bmRlcmFibGVfdmlsbGFnZSwgb3JkZXJfbGV0dGVyLCBwcmlvcml0eSkge1xyXG4gICAgaWYoIXV0aWwuaXNWYWxpZE9yZGVyTGV0dGVyKG9yZGVyX2xldHRlcikpIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKFwib3JkZXJfbGV0dGVyIGludmFsaWQuXCIsIG9yZGVyX2xldHRlcik7XHJcbiAgICB9XHJcbiAgICBzdXBlcihwbHVuZGVyYWJsZV92aWxsYWdlLCBwcmlvcml0eSk7XHJcbiAgICBcclxuICAgIHRoaXMub3JkZXJfbGV0dGVyID0gb3JkZXJfbGV0dGVyLnRvTG93ZXJDYXNlKCk7XHJcbiAgfVxyXG4gIFxyXG4gIGdldCBvcmRlcl9idXR0b24gKCkge1xyXG4gICAgcmV0dXJuIHRoaXMucGx1bmRlcmFibGVfdmlsbGFnZS5nZXRPcmRlckJ1dHRvbih0aGlzLm9yZGVyX2xldHRlcik7XHJcbiAgfVxyXG4gIFxyXG4gIGV4ZWN1dGUgKCkge1xyXG4gICAgaWYodGhpcy5oYXNFbm91Z2hVbml0cygpKSB7XHJcbiAgICAgIGxvZy50cmFjZShcIlRlbXBsYXRlT3JkZXIgZXhlY3V0ZVwiLCB0aGlzKTsgICAgICBcclxuICAgICAgdGhpcy5vcmRlcl9idXR0b24uY2xpY2soKTtcclxuICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBsb2cudHJhY2UoXCJUZW1wbGF0ZU9yZGVyIG5vdCBlbm91Z2ggdW5pdHNcIiwgdGhpcyk7XHJcbiAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH0gXHJcbiAgfVxyXG4gIFxyXG4gIHNpbXVsYXRlICgpIHtcclxuICAgIGxvZy50cmFjZShcIlRlbXBsYXRlT3JkZXIgc2ltdWxhdGVcIiwgdGhpcyk7XHJcbiAgICBcclxuICAgIGxldCBjc3NfY2xhc3MgPSBjb25zdGFudHMuU0lNVUxBVElPTl9CVE5fQ0xBU1M7XHJcbiAgICB0aGlzLm9yZGVyX2J1dHRvbi5hZGRDbGFzcyhjc3NfY2xhc3MpO1xyXG4gIH1cclxuICBcclxuICBnZXQgdW5pdHMgKCkge1xyXG4gICAgbGV0IHRlbXBsYXRlcyA9IG1pbmVyLm1pbmVUZW1wbGF0ZXMoKTsgXHJcbiAgICBcclxuICAgIGlmKHRoaXMub3JkZXJfbGV0dGVyID09PSBcImFcIikge1xyXG4gICAgICByZXR1cm4gdGVtcGxhdGVzW1wiQVwiXTtcclxuICAgIH0gZWxzZSBpZiAodGhpcy5vcmRlcl9sZXR0ZXIgPT09IFwiYlwiKSB7XHJcbiAgICAgIHJldHVybiB0ZW1wbGF0ZXNbXCJCXCJdO1xyXG4gICAgfSBlbHNlIGlmICh0aGlzLm9yZGVyX2xldHRlciA9PT0gXCJjXCIpIHtcclxuICAgICAgcmV0dXJuIHRoaXMucGx1bmRlcmFibGVfdmlsbGFnZS50ZW1wbGF0ZV9jO1xyXG4gICAgfSBcclxuICAgIFxyXG4gICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIG9yZGVyIGxldHRlciBcIicgKyB0aGlzLm9yZGVyX2xldHRlciArICdcIi4nKTtcclxuICB9XHJcbn1cclxuZXhwb3J0cy5UZW1wbGF0ZU9yZGVyID0gVGVtcGxhdGVPcmRlcjtcclxuXHJcblxyXG5cclxuY2xhc3MgQ3VzdG9tT3JkZXIgZXh0ZW5kcyBPcmRlciB7XHJcbiAgY29uc3RydWN0b3IgKHBsdW5kZXJhYmxlX3ZpbGxhZ2UsIHVuaXRzLCBwcmlvcml0eSkge1xyXG4gICAgY29uc3QgREVGQVVMVF9VTklUUyA9IHtzcGVhcjowLCBzd29yZDowLCBheGU6MCwgYXJjaGVyOjAsIHNweTowLCBsaWdodDowLCBtYXJjaGVyOjAsIGhlYXZ5OjAsIHJhbTowLCBjYXRhcHVsdDowLCBrbmlnaHQ6MCwgc25vYjowLCBtaWxpdGlhOjB9O1xyXG4gICAgXHJcbiAgICBzdXBlcihwbHVuZGVyYWJsZV92aWxsYWdlLCBwcmlvcml0eSk7XHJcbiAgICBcclxuICAgIHRoaXMuX3VuaXRzID0gXy5kZWZhdWx0cyh1bml0cywgREVGQVVMVF9VTklUUyk7XHJcbiAgfVxyXG4gICAgXHJcbiAgZ2V0IG9yZGVyX2J1dHRvbiAoKSB7XHJcbiAgICByZXR1cm4gdGhpcy5wbHVuZGVyYWJsZV92aWxsYWdlLmF0dGFja19wbGFjZV9idXR0b247XHJcbiAgfVxyXG4gICAgXHJcbiAgZXhlY3V0ZSAoKSB7XHJcbiAgICBpZighdGhpcy5oYXNFbm91Z2hVbml0cygpKSB7XHJcbiAgICAgIGxvZy50cmFjZShcIlRlbXBsYXRlT3JkZXIgbm90IGVub3VnaCB1bml0c1wiLCB0aGlzKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfSBcclxuICAgIFxyXG4gICAgbGV0IHB2ID0gdGhpcy5wbHVuZGVyYWJsZV92aWxsYWdlO1xyXG4gICAgXHJcbiAgICAvLyBPcGVuIHRoZSBjb21tYW5kIHBvcHVwXHJcbiAgICB2YXIgcGFyYW1zID0gJC5leHRlbmQoe2FqYXg6J2NvbW1hbmQnfSwgeyB0YXJnZXQgOiBwdi5pZCB9ICk7XHJcbiAgICBcclxuICAgIFRyaWJhbFdhcnMuZ2V0KCdwbGFjZScsIHBhcmFtcywgLy8gU2VuZCByZXF1ZXN0IGZvciBhIGNvbW1hbmQgcG9wdXBcclxuICAgICAgKHJlc3BvbnNlKSA9PiB7XHJcbiAgICAgICAgbGV0IGRfanEgPSAkKFwiPGRpdj5cIiArIHJlc3BvbnNlLmRpYWxvZyArIFwiPC9kaXY+XCIpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFVuaXRzXHJcbiAgICAgICAgXy5mb3JJbih0aGlzLnVuaXRzLCAodiwgaykgPT4gZF9qcS5maW5kKFwiI2NvbW1hbmQtZGF0YS1mb3JtIGlucHV0W25hbWU9XCIgKyBrICsgXCJdXCIpLnZhbCh2KSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gUG9zaXRpb25cclxuICAgICAgICBkX2pxLmZpbmQoXCIjY29tbWFuZC1kYXRhLWZvcm0gaW5wdXRbbmFtZT14XVwiKS52YWwocHYuY29vcmRpbmF0ZXMueCk7XHJcbiAgICAgICAgZF9qcS5maW5kKFwiI2NvbW1hbmQtZGF0YS1mb3JtIGlucHV0W25hbWU9eV1cIikudmFsKHB2LmNvb3JkaW5hdGVzLnkpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGxldCBkYXRhID0gZF9qcS5maW5kKFwiI2NvbW1hbmQtZGF0YS1mb3JtXCIpLnNlcmlhbGl6ZUFycmF5KCk7XHJcbiAgICAgICAgZGF0YS5wdXNoKHsgbmFtZTogXCJhdHRhY2tcIiwgdmFsdWU6ICdsJyB9KTtcclxuICAgICAgICBcclxuICAgICAgICBUcmliYWxXYXJzLnBvc3QoJ3BsYWNlJywgeyBhamF4OiAnY29uZmlybScgfSwgZGF0YSwgLy8gQ29uZmlybSBhdHRhY2tcclxuICAgICAgICAgIChyZXNwb25zZV9jb25maXJtKSA9PiB7XHJcbiAgICAgICAgICAgIGxldCBkX2NvbmZpcm1fanEgPSAkKFwiPGRpdj5cIiArIHJlc3BvbnNlX2NvbmZpcm0uZGlhbG9nICsgXCI8L2Rpdj5cIik7XHJcbiAgICAgICAgICAgIGxldCBjb25maXJtX2RhdGEgPSBkX2NvbmZpcm1fanEuZmluZCgnI2NvbW1hbmQtZGF0YS1mb3JtJykuc2VyaWFsaXplQXJyYXkoKTtcclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgVHJpYmFsV2Fycy5wb3N0KCdwbGFjZScsIHsgYWpheGFjdGlvbjogJ3BvcHVwX2NvbW1hbmQnIH0sIGNvbmZpcm1fZGF0YSwgLy8gRmluYWwgcmVzcG9uc2VcclxuICAgICAgICAgICAgICAocmVzcG9uc2VfZmluYWwpID0+IHtcclxuICAgICAgICAgICAgICAgIFVJLlN1Y2Nlc3NNZXNzYWdlKHJlc3BvbnNlX2ZpbmFsLm1lc3NhZ2UpO1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2cocmVzcG9uc2VfZmluYWwpO1xyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICApO1xyXG4gICAgICB9XHJcbiAgICApO1xyXG4gIH1cclxuICBcclxuICBzaW11bGF0ZSAoKSB7XHJcbiAgICBsb2cudHJhY2UoXCJDdXN0b21PcmRlciBzaW11bGF0ZVwiLCB0aGlzKTtcclxuICAgIFxyXG4gICAgbGV0IGNzc19jbGFzcyA9IGNvbnN0YW50cy5TSU1VTEFUSU9OX0JUTl9DTEFTUztcclxuICAgIHRoaXMub3JkZXJfYnV0dG9uLmFkZENsYXNzKGNzc19jbGFzcyk7XHJcbiAgfVxyXG4gIFxyXG4gIGdldCB1bml0cyAoKSB7XHJcbiAgICByZXR1cm4gdGhpcy5fdW5pdHM7XHJcbiAgfVxyXG59XHJcbmV4cG9ydHMuQ3VzdG9tT3JkZXIgPSBDdXN0b21PcmRlcjsiLCJsZXQgJCA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93WyckJ10gOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsWyckJ10gOiBudWxsKTtcclxubGV0IF8gPSAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvd1snXyddIDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbFsnXyddIDogbnVsbCk7XHJcbmxldCBsb2cgPSByZXF1aXJlKCdsb2dsZXZlbCcpLmdldExvZ2dlcihcIlBsdW5kZXJhYmxlVmlsbGFnZVwiKTtcclxuXHJcbmxldCB1dGlsID0gcmVxdWlyZShcIi4vLi4vdXRpbFwiKTtcclxuXHJcblxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBjbGFzcyBQbHVuZGVyYWJsZVZpbGxhZ2Uge1xyXG4gIGNvbnN0cnVjdG9yIChpZCwgcmVwb3J0X2lkLCBjb29yZGluYXRlcywgaXNfYXR0YWNraW5nLCByZXMsIHdhbGwsIGRpc3RhbmNlLCB0ZW1wbGF0ZV9jKSB7XHJcbiAgICBcInVzZSBzdHJpY3RcIjtcclxuICAgIFxyXG4gICAgdGhpcy5pZCA9IGlkO1xyXG4gICAgdGhpcy5yZXBvcnRfaWQgPSByZXBvcnRfaWQ7XHJcbiAgICB0aGlzLmNvb3JkaW5hdGVzID0gY29vcmRpbmF0ZXM7XHJcbiAgICB0aGlzLmlzX2F0dGFja2luZyA9IGlzX2F0dGFja2luZztcclxuICAgIHRoaXMucmVzID0gcmVzO1xyXG4gICAgdGhpcy53YWxsID0gd2FsbDtcclxuICAgIHRoaXMuZGlzdGFuY2UgPSBkaXN0YW5jZTtcclxuICAgIHRoaXMudGVtcGxhdGVfYyA9IHRlbXBsYXRlX2M7XHJcbiAgfVxyXG4gIFxyXG4gIGdldCBUUiAoKSB7XHJcbiAgICBcInVzZSBzdHJpY3RcIlxyXG4gICAgXHJcbiAgICByZXR1cm4gJCgnIycgKyB0aGlzLnRyX2lkKS5maXJzdCgpO1xyXG4gIH1cclxuICBcclxuICBnZXQgdHJfaWQgKCkge1xyXG4gICAgcmV0dXJuIFwidmlsbGFnZV9cIiArIHRoaXMuaWQ7XHJcbiAgfVxyXG4gIFxyXG4gIGdldFRvdGFsUmVzICgpIHtcclxuICAgIFwidXNlIHN0cmljdFwiO1xyXG4gICAgXHJcbiAgICByZXR1cm4gXy5zdW0oXy52YWx1ZXModGhpcy5yZXMpKTtcclxuICB9XHJcbiAgXHJcbiAgZ2V0T3JkZXJCdXR0b24gKG9yZGVyX2xldHRlcikge1xyXG4gICAgaWYgKCF1dGlsLmlzVmFsaWRPcmRlckxldHRlcihvcmRlcl9sZXR0ZXIpKSB7IC8vIG9yZGVyX2xldHRlciBpc24ndCBhLCBiIG9yIGNcclxuICAgICAgdGhyb3cgbmV3IEVycm9yICgnXCInICsgb3JkZXJfbGV0dGVyICsgJ1wiaXMgbm90IGEgdmFsaWQgb3JkZXJfbGV0dGVyLiBNdXN0IGJlIEEsIEIgb3IgQyAoY2FzZSBpbnNlbnNpdGl2ZSkuJyk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIG9yZGVyX2xldHRlciA9IG9yZGVyX2xldHRlci50b0xvd2VyQ2FzZSgpO1xyXG4gICAgXHJcbiAgICBsZXQgcXVlcnkgPSBcIi5mYXJtX2ljb25fXCIgKyBvcmRlcl9sZXR0ZXI7ICBcclxuICAgIHJldHVybiB0aGlzLlRSLmZpbmQocXVlcnkpO1xyXG4gIH1cclxuICBcclxuICBpc09yZGVyQXZhaWFibGUgKG9yZGVyX2xldHRlcikge1xyXG4gICAgcmV0dXJuIHRoaXMuZ2V0T3JkZXJCdXR0b24ob3JkZXJfbGV0dGVyKS5oYXNDbGFzcyhcImZhcm1faWNvbl9kaXNhYmxlZFwiKTtcclxuICB9XHJcbiAgXHJcbiAgZ2V0IGF0dGFja19wbGFjZV9idXR0b24gKCkge1xyXG4gICAgcmV0dXJuIHRoaXMuVFIuZmluZChcImltZ1tzcmMqPXBsYWNlXVwiKTtcclxuICB9XHJcbiAgXHJcbiAgY2xpY2tPcmRlciAob3JkZXJfbGV0dGVyKSB7XHJcbiAgICBsb2cuaW5mbyhcImNsaWNrZWRcIiwgb3JkZXJfbGV0dGVyLCB0aGlzKTtcclxuICAgIHRoaXMuZ2V0T3JkZXJCdXR0b24ob3JkZXJfbGV0dGVyKS5jbGljaygpO1xyXG4gIH1cclxufSIsIlwidXNlIHN0cmljdFwiO1xyXG5cclxubGV0ICQgPSAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvd1snJCddIDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbFsnJCddIDogbnVsbCk7XHJcbmxldCBfID0gKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3dbJ18nXSA6IHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWxbJ18nXSA6IG51bGwpO1xyXG5sZXQgbG9nID0gcmVxdWlyZSgnbG9nbGV2ZWwnKTtcclxuXHJcbmxldCBTZXR0aW5ncyA9IHJlcXVpcmUoXCIuL3NldHRpbmdzXCIpO1xyXG5cclxuZnVuY3Rpb24gc2V0TG9nTGV2ZWwgKCkge1xyXG4gIGlmIChTZXR0aW5ncy5lbnYgPT09IFwiZGV2XCIpIHtcclxuICAgIGxvZy5zZXRMZXZlbChsb2cubGV2ZWxzLlRSQUNFLCBmYWxzZSk7ICBcclxuICB9IGVsc2Uge1xyXG4gICAgbG9nLnNldExldmVsKGxvZy5sZXZlbHMuRVJST1IsIGZhbHNlKTtcclxuICB9ICBcclxufVxyXG5zZXRMb2dMZXZlbCgpO1xyXG5cclxubGV0IFVJID0gcmVxdWlyZShcIi4vdWlcIik7XHJcblxyXG4vKioqIEdsb2JhbCBGbnMgKioqL1xyXG53aW5kb3cuVFdGQVBfVG9nZ2xlX0VudiA9IGZ1bmN0aW9uICgpIHtcclxuICBTZXR0aW5ncy5lbnYgPSAoU2V0dGluZ3MuZW52ID09PSBcInByb2RcIikgPyBcImRldlwiIDogXCJwcm9kXCI7XHJcbiAgc2V0TG9nTGV2ZWwoKTtcclxuICBcclxuICBjb25zb2xlLmxvZyhcIkVudmlyb21lbnQgaXMgbm93OlwiLCBTZXR0aW5ncy5lbnYpO1xyXG59XHJcblxyXG5cclxuLyoqKiBFeGVjdXRpb24gKioqL1xyXG5VSS5pbmplY3RVSSgpOyIsImxldCAkID0gKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3dbJyQnXSA6IHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWxbJyQnXSA6IG51bGwpO1xyXG5sZXQgXyA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93WydfJ10gOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsWydfJ10gOiBudWxsKTtcclxubGV0IGxvZyA9IHJlcXVpcmUoJ2xvZ2xldmVsJykuZ2V0TG9nZ2VyKFwiTWluZXJcIik7XHJcblxyXG5sZXQgUGx1bmRlcmFibGVWaWxsYWdlID0gcmVxdWlyZShcIi4vZGF0YS9wbHVuZGVyYWJsZS12aWxsYWdlXCIpO1xyXG5sZXQgTWluZXIgPSByZXF1aXJlKFwiLi9taW5lclwiKTtcclxuXHJcblxyXG5cclxuZXhwb3J0cy5wYXJzZVJlc291cmNlID0gZnVuY3Rpb24gKHJlc190ZXh0KSB7XHJcbiAgXCJ1c2Ugc3RyaWN0XCI7XHJcblxyXG4gIC8vIFJhdyBmb3JtYXQ6IFwiICAxLjY1MiA5NTAgMi4wMTUgXCJcclxuICBsZXQgciA9XyhyZXNfdGV4dClcclxuICAgIC5yZXBsYWNlKC9cXC4vZywgXCJcIilcclxuICAgIC50cmltKClcclxuICAgIC5zcGxpdChcIiBcIilcclxuICAgIC5maWx0ZXIoZnVuY3Rpb24gKHgpIHsgcmV0dXJuIHggIT09IFwiXCI7IH0pXHJcbiAgICAubWFwKF8ucGFyc2VJbnQpO1xyXG4gICAgXHJcbiAgICByZXR1cm4geyB3b29kOnJbMF0sIHN0b25lOnJbMV0sIGlyb246clsyXSB9O1xyXG59XHJcblxyXG5leHBvcnRzLnBhcnNlQ29vcmRpbmF0ZXMgPSBmdW5jdGlvbiAocG9zaXRpb25fdGV4dCkge1xyXG4gIGxldCBwb3MgPSAvXFwoKFxcZCspXFx8KFxcZCspXFwpLy5leGVjKHBvc2l0aW9uX3RleHQpO1xyXG4gIHJldHVybiB7eCA6IF8ucGFyc2VJbnQocG9zWzFdKSwgeSA6IF8ucGFyc2VJbnQocG9zWzJdKSB9OyAgXHJcbn1cclxuXHJcbmV4cG9ydHMubWluZVBsdW5kZXJWaWxsYWdlcyA9IGZ1bmN0aW9uICgpIHtcclxuICBcInVzZSBzdHJpY3RcIjtcclxuICBcclxuICBsZXQgcGx1bmRlcmFibGVfdmlsbGFnZXMgPSBbXTtcclxuICBcclxuICAvLyBHZXQgdmlsbGFnZXMgZGF0YVxyXG4gICQoXCIjcGx1bmRlcl9saXN0IFtpZCo9dmlsbGFnZV9dXCIpXHJcbiAgICAuZWFjaCggKGluZGV4LCBlbGVtZW50KSA9PiB7XHJcbiAgICAgIFxyXG4gICAgICBsZXQgamUgPSAkKGVsZW1lbnQpO1xyXG4gICAgICBcclxuICAgICAgbGV0IHRyX2lkID0gamUuYXR0cihcImlkXCIpO1xyXG4gICAgICBsZXQgaWQgPSBfLnBhcnNlSW50KF8uZmlyc3QoL1xcZCsvLmV4ZWModHJfaWQpKSk7XHJcbiAgICAgIGxldCByZXBvcnRfaWQgPSBfLnBhcnNlSW50KF8ubGFzdCgvdmlldz0oXFxkKykvLmV4ZWMoamUuZmluZChcImFbaHJlZio9cmVwb3J0XVwiKS5hdHRyKFwiaHJlZlwiKSkpKTtcclxuICAgICAgbGV0IGNvb3JkaW5hdGVzID0gIE1pbmVyLnBhcnNlQ29vcmRpbmF0ZXMoamUuZmluZChcImFbaHJlZio9cmVwb3J0XVwiKS50ZXh0KCkpO1xyXG4gICAgICBsZXQgaXNfYXR0YWNraW5nID0gIV8uaXNFbXB0eShqZS5maW5kKFwiaW1nW3NyYyo9YXR0YWNrXVwiKSk7XHJcbiAgICAgIGxldCByZXMgPSBNaW5lci5wYXJzZVJlc291cmNlKGplLmZpbmQoXCJ0ZDpudGgtY2hpbGQoNilcIikudGV4dCgpKTtcclxuICAgICAgbGV0IHdhbGwgPSBfLnBhcnNlSW50KGplLmZpbmQoXCJ0ZDpudGgtY2hpbGQoNylcIikudGV4dCgpKTtcclxuICAgICAgbGV0IGRpc3RhbmNlID0gcGFyc2VGbG9hdChqZS5maW5kKFwidGQ6bnRoLWNoaWxkKDgpXCIpLnRleHQoKSk7XHJcbiAgICAgIFxyXG4gICAgICAvLyBUZW1wbGF0ZSBDXHJcbiAgICAgIGxldCB0ZW1wbGF0ZV9jX2EgPSBqZS5maW5kKFwiYVtkYXRhLXVuaXRzLWZvcmVjYXN0XVwiKTtcclxuICAgICAgbGV0IHRlbXBsYXRlX2MgPSB7fTtcclxuICAgICAgaWYoIXRlbXBsYXRlX2NfYS5oYXNDbGFzcyhcImZhcm1faWNvbl9kaXNhYmxlZFwiKSkge1xyXG4gICAgICAgIHRlbXBsYXRlX2MgPSBKU09OLnBhcnNlKHRlbXBsYXRlX2NfYS5hdHRyKFwiZGF0YS11bml0cy1mb3JlY2FzdFwiKSk7XHJcbiAgICAgIH1cclxuICAgICAgXHJcbiAgICAgIC8vIENyZWF0ZSBvYmplY3RcclxuICAgICAgbGV0IHB2ID0gbmV3IFBsdW5kZXJhYmxlVmlsbGFnZShpZCwgcmVwb3J0X2lkLCBjb29yZGluYXRlcywgaXNfYXR0YWNraW5nLCByZXMsIHdhbGwsIGRpc3RhbmNlLCB0ZW1wbGF0ZV9jKTtcclxuICAgICAgXHJcbiAgICAgIGxvZy50cmFjZShcIk1pbmVkIHZpbGxhZ2VcIiwgcHYpO1xyXG4gICAgICBcclxuICAgICAgcGx1bmRlcmFibGVfdmlsbGFnZXMucHVzaChwdik7ICAgIFxyXG4gICAgfVxyXG4gICk7XHJcbiAgXHJcbiAgcmV0dXJuIHBsdW5kZXJhYmxlX3ZpbGxhZ2VzO1xyXG59O1xyXG5cclxuZXhwb3J0cy5taW5lQ3VycmVudFVuaXRzID0gZnVuY3Rpb24gKCkge1xyXG4gIHJldHVybiB3aW5kb3cuQWNjb3VudG1hbmFnZXIuZmFybS5jdXJyZW50X3VuaXRzO1xyXG59XHJcblxyXG5leHBvcnRzLm1pbmVUZW1wbGF0ZXMgPSBfLm9uY2UoZnVuY3Rpb24gKCkge1xyXG4gIGNvbnN0IERFRkFVTFRfVEVNUExBVEUgPSB7c3BlYXIgOiAwLCBzd29yZCA6IDAsIGF4ZSA6IDAsIGFyY2hlciA6IDAsIHNweSA6IDAsIGxpZ2h0IDogMCwgbWFyY2hlciA6IDAsIGhlYXZ5IDogMCwga25pZ2h0IDogMH07XHJcbiAgXHJcbiAgbGV0IHRlbXBsYXRlcyA9IHdpbmRvdy5BY2NvdW50bWFuYWdlci5mYXJtLnRlbXBsYXRlcztcclxuICBsZXQgdGVtcGxhdGVzX2tleXMgPSBfLmtleXMod2luZG93LkFjY291bnRtYW5hZ2VyLmZhcm0udGVtcGxhdGVzKTtcclxuICBcclxuICBsZXQgdGVtcGxhdGVfQSA9IF8uZGVmYXVsdHModGVtcGxhdGVzW18uZmlyc3QodGVtcGxhdGVzX2tleXMpXSwgREVGQVVMVF9URU1QTEFURSk7XHJcbiAgbGV0IHRlbXBsYXRlX0IgPSBfLmRlZmF1bHRzKHRlbXBsYXRlc1tfLmZpcnN0KHRlbXBsYXRlc19rZXlzKV0sIERFRkFVTFRfVEVNUExBVEUpO1xyXG4gIFxyXG4gIHRlbXBsYXRlcyA9IHtBOnRlbXBsYXRlX0EsIEI6dGVtcGxhdGVfQn07XHJcbiAgXHJcbiAgbG9nLnRyYWNlKFwiTWluZWQgdGVtcGxhdGVzXCIsIHRlbXBsYXRlcyk7XHJcbiAgXHJcbiAgcmV0dXJuIHRlbXBsYXRlcztcclxufSk7IiwiLyoqKiBJbXBvcnRzICoqKi9cclxubGV0IF8gPSAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvd1snXyddIDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbFsnXyddIDogbnVsbCk7XHJcblxyXG5sZXQgU3RvcmFnZSA9IHJlcXVpcmUoJy4vc3RvcmFnZScpO1xyXG5sZXQgY29uc3RhbnRzID0gcmVxdWlyZSgnLi9jb25zdCcpO1xyXG5cclxuLy8gQ29uc3RzXHJcbmNvbnN0IFNFVFRJTkdTX1NUT1JBR0VfTkFNRSA9IFwiU2V0dGluZ3NcIjtcclxuXHJcbmxldCBTZXR0aW5ncyA9IF8uZGVmYXVsdHNEZWVwKFN0b3JhZ2UuZ2V0KFNFVFRJTkdTX1NUT1JBR0VfTkFNRSwge30pLCBjb25zdGFudHMuREVGQVVMVF9TRVRUSU5HUyk7XHJcblxyXG5PYmplY3Qub2JzZXJ2ZShTZXR0aW5ncyxcclxuICBmdW5jdGlvbiAoY2hhbmdlcykge1xyXG4gICAgU3RvcmFnZS5zZXQoU0VUVElOR1NfU1RPUkFHRV9OQU1FLCBfLmxhc3QoY2hhbmdlcykub2JqZWN0KTtcclxuICB9XHJcbik7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IFNldHRpbmdzOyIsIi8qIGdsb2JhbCBHTV9zZXRWYWx1ZSAqL1xyXG4vKiBnbG9iYWwgR01fZ2V0VmFsdWUgKi9cclxuICBcclxubGV0IF8gPSAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvd1snXyddIDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbFsnXyddIDogbnVsbCk7XHJcblxyXG5leHBvcnRzLmdldCA9IGZ1bmN0aW9uIChuYW1lLCBkZWZhdWx0eSkge1xyXG4gIHJldHVybiBHTV9nZXRWYWx1ZShuYW1lLCBkZWZhdWx0eSk7IFxyXG59XHJcblxyXG5leHBvcnRzLnNldCA9IGZ1bmN0aW9uIChuYW1lLCB2YWx1ZSkge1xyXG4gIHJldHVybiBHTV9zZXRWYWx1ZShuYW1lLCB2YWx1ZSk7XHJcbn0gIiwiLyogZ2xvYmFsIEdNX2FkZFN0eWxlICovXHJcblxyXG5cclxuXHJcbmxldCAkID0gKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3dbJyQnXSA6IHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWxbJyQnXSA6IG51bGwpO1xyXG5sZXQgXyA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93WydfJ10gOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsWydfJ10gOiBudWxsKTtcclxubGV0IGxvZyA9IHJlcXVpcmUoJ2xvZ2xldmVsJykuZ2V0TG9nZ2VyKFwiVUlcIik7XHJcbmxldCBTdGF0ZU1hY2hpbmUgPSByZXF1aXJlKFwiamF2YXNjcmlwdC1zdGF0ZS1tYWNoaW5lXCIpO1xyXG5cclxubGV0IGNvbnN0YW50cyA9IHJlcXVpcmUoXCIuL2NvbnN0XCIpO1xyXG5sZXQgc2V0dGluZ3MgPSByZXF1aXJlKFwiLi9zZXR0aW5nc1wiKTtcclxubGV0IG1pbmVyID0gcmVxdWlyZShcIi4vbWluZXJcIik7XHJcbmxldCBib3QgPSByZXF1aXJlKFwiLi9ib3RcIik7XHJcblxyXG4vKioqIEV4ZWN1dGlvbiBGU00gKioqL1xyXG52YXIgZXhlY3V0aW9uX2ZzbSA9IFN0YXRlTWFjaGluZS5jcmVhdGUoe1xyXG4gIGluaXRpYWw6ICdpbml0JyxcclxuICBldmVudHM6IFtcclxuICAgIHsgbmFtZTogJ2V4ZWN1dGUnLCAgZnJvbTogJ2luaXQnLCAgdG86ICdleGVjdXRpbmcnIH0sXHJcbiAgICB7IG5hbWU6ICdkb25lJywgZnJvbTogJ2V4ZWN1dGluZycsIHRvOiAnZXhlY3V0ZWQnfSxcclxuICAgIHsgbmFtZTogJ3JlbG9hZCcsICBmcm9tOiAnZXhlY3V0ZWQnLCAgICB0bzogJ3JlbG9hZGluZyd9XHJcbl19KTtcclxuXHJcbmV4ZWN1dGlvbl9mc20ub25leGVjdXRlID0gZnVuY3Rpb24gKCkge1xyXG4gIGJvdC5leGVjdXRlKClcclxuICAgIC50aGVuKF8uYmluZChleGVjdXRpb25fZnNtLmRvbmUsIGV4ZWN1dGlvbl9mc20pKTtcclxufVxyXG5cclxuZXhlY3V0aW9uX2ZzbS5vbnJlbG9hZCA9IGZ1bmN0aW9uICgpIHtcclxuICBsb2NhdGlvbi5yZWxvYWQoKTtcclxufVxyXG5cclxuZnVuY3Rpb24gYXBwZW5kVG90YWxSZXNDb2wgKCkge1xyXG4gIC8qKiBBcHBlbmQgdG90YWwgcmVzb3VyY2VzIHRvIHJlc291cmNlcyBjb2x1bW4gKiovXHJcbiAgJCgnI3BsdW5kZXJfbGlzdCB0ciB0ZDpudGgtY2hpbGQoNiknKS5lYWNoKGZ1bmN0aW9uICgpIHtcclxuICAgIFwidXNlIHN0cmljdFwiO1xyXG4gICAgXHJcbiAgICBsZXQgcmVzX2pxID0gJCh0aGlzKTtcclxuICAgIGxldCByZXMgPSBtaW5lci5wYXJzZVJlc291cmNlKHJlc19qcS50ZXh0KCkpO1xyXG4gICAgbGV0IHJlc19zdW0gPSBfLnN1bShfLnZhbHVlcyhyZXMpKTtcclxuICAgIFxyXG4gICAgcmVzX2pxLmFwcGVuZCgnIDxzcGFuIGNsYXNzPVwiaWNvbiBoZWFkZXIgcmVzc291cmNlc1wiPjwvc3Bhbj4gJyArIHJlc19zdW0pO1xyXG4gIH0pO1xyXG59XHJcblxyXG5cclxuXHJcbmV4cG9ydHMuaW5qZWN0VUkgPSBmdW5jdGlvbiAoKSB7XHJcbiAgLy8gTG9hZCBmaWxlc1xyXG4gIGxldCB1aV9odG1sID0gXCI8ZGl2IGNsYXNzPVxcXCJ2aXNcXFwiPlxcclxcbiAgPHRhYmxlIHN0eWxlPVxcXCJ3aWR0aDoxMDAlXFxcIj5cXHJcXG4gICAgPHRib2R5PlxcclxcbiAgICAgIDx0cj4gPCEtLSBIZWFkZXIgLS0+XFxyXFxuICAgICAgICBcXHJcXG4gICAgICAgIDx0aCBjbGFzcz1cXFwidmlzXFxcIj5cXHJcXG4gICAgICAgICAgPGg0PlRXRkFQOiA8L2g0PlxcclxcbiAgICAgICAgPC90aD5cXHJcXG4gICAgICAgIFxcclxcbiAgICAgIDwvdHI+XFxyXFxuICAgICAgIFxcclxcbiAgICAgIFxcclxcbiAgICAgIDx0cj4gPCEtLSBDb25maWdzIC0tPlxcclxcbiAgICAgICAgXFxyXFxuICAgICAgICA8dGQ+XFxyXFxuICAgICAgICAgIDxpbnB1dCBpZD1cXFwiVFdGQVAtYnRuLWV4ZWN1dGVcXFwiIHR5cGU9XFxcInN1Ym1pdFxcXCIgdmFsdWU9XFxcIkV4ZWN0dXRlIEZhcm1cXFwiIGNsYXNzPVxcXCJidG5cXFwiIHN0eWxlPVxcXCJmbG9hdDogbGVmdDtcXFwiIC8+XFxyXFxuICAgICAgICAgIFxcclxcbiAgICAgICAgICA8aW5wdXQgaWQ9XFxcIlRXRkFQLWJ0bi1zaW11bGF0ZVxcXCIgdHlwZT1cXFwic3VibWl0XFxcIiB2YWx1ZT1cXFwiU2ltdWxhdGUgRmFybVxcXCIgY2xhc3M9XFxcImJ0blxcXCIgc3R5bGU9XFxcImZsb2F0OiBsZWZ0O1xcXCIgLz5cXHJcXG4gICAgICAgICAgXFxyXFxuICAgICAgICAgIDxpbnB1dCBpZD1cXFwiVFdGQVAtYnRuLWNsZWFyLXNpbXVsYXRpb25cXFwiIHR5cGU9XFxcInN1Ym1pdFxcXCIgdmFsdWU9XFxcIkNsZWFyIFNpbXVsYXRpb25cXFwiIGNsYXNzPVxcXCJidG5cXFwiIHN0eWxlPVxcXCJmbG9hdDogbGVmdDtcXFwiIC8+XFxyXFxuICAgICAgICAgIFxcclxcbiAgICAgICAgICBcXHJcXG4gICAgICAgIDwvdGQ+XFxyXFxuICAgICAgICBcXHJcXG4gICAgICA8L3RyPlxcclxcbiAgICAgIFxcclxcbiAgICAgIDx0cj5cXHJcXG4gICAgICAgIDx0ZD5cXHJcXG4gICAgICAgICAgPHByb2dyZXNzIGlkPVxcXCJUV0ZBUC1wcm9ncmVzcy1leGVjdXRpb25cXFwiIHZhbHVlPVxcXCIwXFxcIiBtYXg9XFxcIjBcXFwiIHN0eWxlPVxcXCJ3aWR0aDoxMDAlO1xcXCI+PC9wcm9ncmVzcz5cXHJcXG4gICAgICAgIDwvdGQ+XFxyXFxuICAgICAgPC90cj4gICAgICBcXHJcXG4gICAgICBcXHJcXG4gICAgICA8dHI+XFxyXFxuICAgICAgICA8dGQ+XFxyXFxuICAgICAgICAgIDx0ZXh0YXJlYSBpZD1cXFwiVFdGQVAtdHh0YXJlYS1zZXR0aW5nc1xcXCIgcm93cz1cXFwiMTBcXFwiIHN0eWxlPVxcXCJ3aWR0aDoxMDAlO1xcXCI+PC90ZXh0YXJlYT5cXHJcXG4gICAgICAgIDwvdGQ+XFxyXFxuICAgICAgPC90cj5cXHJcXG4gICAgICBcXHJcXG4gICAgICA8dHI+XFxyXFxuICAgICAgICA8dGQ+XFxyXFxuICAgICAgICAgIDxpbnB1dCBpZD1cXFwiVFdGQVAtYnRuLXNhdmUtc2V0dGluZ3NcXFwiIHR5cGU9XFxcInN1Ym1pdFxcXCIgdmFsdWU9XFxcIlNhdmUgc2V0dGluZ3NcXFwiIGNsYXNzPVxcXCJidG5cXFwiIHN0eWxlPVxcXCJmbG9hdDogcmlnaHQ7XFxcIiAvPlxcclxcbiAgICAgICAgICBcXHJcXG4gICAgICAgICAgPGlucHV0IGlkPVxcXCJUV0ZBUC1idG4tcmVzZXQtc2V0dGluZ3NcXFwiIHR5cGU9XFxcInN1Ym1pdFxcXCIgdmFsdWU9XFxcIlJlc2V0IHNldHRpbmdzXFxcIiBjbGFzcz1cXFwiYnRuXFxcIiBzdHlsZT1cXFwiZmxvYXQ6IHJpZ2h0O1xcXCIgLz5cXHJcXG4gICAgICAgIDwvdGQ+XFxyXFxuICAgICAgPC90cj5cXHJcXG4gICAgICBcXHJcXG4gICAgICAgICAgXFxyXFxuICAgIDwvdGJvZHk+XFxyXFxuICA8L3RhYmxlPlxcclxcbjwvZGl2PlxcclxcblwiO1xyXG4gIGxldCBjc3MgPSBCdWZmZXIoXCJMbFJYUmxBdFluUnVMWE5wYlhWc1lYUnBiMjRnZXcwS0lDQmliM0prWlhJZ09pQXpjSGdnWkdGemFHVmtJR2R5WldWdU93MEtmUT09XCIsXCJiYXNlNjRcIik7IFxyXG4gIFxyXG4gIC8vIEluamVjdCBzdHlsZXNoZWV0XHJcbiAgR01fYWRkU3R5bGUoY3NzKTtcclxuICAgXHJcbiAgLy8gSW5qZWN0IGJvdCBpbnRlcmZhY2VcclxuICAkKFwiI2Zhcm1fdW5pdHNcIikucGFyZW50KCkuYWZ0ZXIodWlfaHRtbCk7XHJcbiAgXHJcbiAgLy8gQmluZCBldmVudHNcclxuICAkKFwiI1RXRkFQLWJ0bi1leGVjdXRlXCIpLmNsaWNrKCgpID0+IHtcclxuICAgIGlmKGV4ZWN1dGlvbl9mc20uY2FuKFwiZXhlY3V0ZVwiKSkge1xyXG4gICAgICBleGVjdXRpb25fZnNtLmV4ZWN1dGUoKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGV4ZWN1dGlvbl9mc20ucmVsb2FkKCk7XHJcbiAgICB9XHJcbiAgfSk7XHJcbiAgXHJcbiAgJChcIiNUV0ZBUC1idG4tc2ltdWxhdGVcIikuY2xpY2soXy5iaW5kKGJvdC5zaW11bGF0ZSwgYm90KSk7XHJcbiAgJChcIiNUV0ZBUC1idG4tY2xlYXItc2ltdWxhdGlvblwiKS5jbGljayhfLmJpbmQoYm90LmNsZWFyU2ltdWxhdGlvbiwgYm90KSk7XHJcbiAgJChcIiNUV0ZBUC10eHRhcmVhLXNldHRpbmdzXCIpLnZhbChKU09OLnN0cmluZ2lmeShzZXR0aW5ncykpO1xyXG4gIFxyXG4gICQoXCIjVFdGQVAtYnRuLXNhdmUtc2V0dGluZ3NcIikuY2xpY2soKCkgPT4ge1xyXG4gICAgbGV0IG5ld1NldHRpbmdzID0gSlNPTi5wYXJzZSgkKFwiI1RXRkFQLXR4dGFyZWEtc2V0dGluZ3NcIikudmFsKCkpO1xyXG4gICAgbG9nLmluZm8oXCJVSSBuZXcgU2V0dGluZ3M6XCIsIG5ld1NldHRpbmdzKTtcclxuICAgIFxyXG4gICAgZm9yICh2YXIgbWVtYmVyIGluIHNldHRpbmdzKSBkZWxldGUgc2V0dGluZ3NbbWVtYmVyXTtcclxuICAgIF8uYXNzaWduKHNldHRpbmdzLCBuZXdTZXR0aW5ncyk7XHJcbiAgfSk7XHJcbiAgXHJcbiAgJChcIiNUV0ZBUC1idG4tcmVzZXQtc2V0dGluZ3NcIikuY2xpY2soKCkgPT4ge1xyXG4gICAgbGV0IG5ld1NldHRpbmdzID0gY29uc3RhbnRzLkRFRkFVTFRfU0VUVElOR1M7XHJcbiAgICBsb2cuaW5mbyhcIlVJIHJlc2V0IFNldHRpbmdzOlwiLCBuZXdTZXR0aW5ncyk7XHJcbiAgICBcclxuICAgIGZvciAodmFyIG1lbWJlciBpbiBzZXR0aW5ncykgZGVsZXRlIHNldHRpbmdzW21lbWJlcl07XHJcbiAgICBfLmFzc2lnbihzZXR0aW5ncywgbmV3U2V0dGluZ3MpO1xyXG4gICAgXHJcbiAgICAkKFwiI1RXRkFQLXR4dGFyZWEtc2V0dGluZ3NcIikudmFsKEpTT04uc3RyaW5naWZ5KHNldHRpbmdzKSk7XHJcbiAgfSk7XHJcbiAgXHJcbiAgYXBwZW5kVG90YWxSZXNDb2woKTtcclxuICBcclxufSIsImxldCAkID0gKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3dbJyQnXSA6IHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWxbJyQnXSA6IG51bGwpO1xyXG5sZXQgXyA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93WydfJ10gOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsWydfJ10gOiBudWxsKTtcclxuXHJcbmxldCBTZXR0aW5ncyA9IHJlcXVpcmUoXCIuL3NldHRpbmdzXCIpO1xyXG5sZXQgbWluZXIgPSByZXF1aXJlKFwiLi9taW5lclwiKTtcclxuXHJcbmV4cG9ydHMubWF5YmVSdW5GbnMgPSBmdW5jdGlvbiAoZm5zLCBjaGFuY2Vfb2ZfZXhlY3V0aW5nLCBpbnRlcnZhbCkge1xyXG4gIGludGVydmFsID0gaW50ZXJ2YWwgfHwgMTAwMDtcclxuICBsZXQgZm5zX2luZGV4ID0gMDsgXHJcbiAgXHJcbiAgbGV0IGludGVydmFsSUQgPVxyXG4gICAgc2V0SW50ZXJ2YWwoICgpID0+IHtcclxuICAgICAgaWYoZm5zX2luZGV4ID49IGZucy5sZW5ndGgpIHtcclxuICAgICAgICBjbGVhckludGVydmFsKGludGVydmFsSUQpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgICAgfSBlbHNlIGlmKF8ucmFuZG9tKDAsIDEsIHRydWUpIDwgY2hhbmNlX29mX2V4ZWN1dGluZykge1xyXG4gICAgICAgIGZuc1tmbnNfaW5kZXgrK10oKTtcclxuICAgICAgfVxyXG4gICAgfSxcclxuICAxMDAwKTtcclxufVxyXG5cclxuZXhwb3J0cy5pc1ZhbGlkT3JkZXJMZXR0ZXIgPSBmdW5jdGlvbiAob3JkZXJfbGV0dGVyKSB7XHJcbiAgdHJ5IHtcclxuICAgIHJldHVybiB0eXBlb2Ygb3JkZXJfbGV0dGVyID09PSBcInN0cmluZ1wiICYmXHJcbiAgICAgIG9yZGVyX2xldHRlci5sZW5ndGggPT09IDEgJiZcclxuICAgICAgL1thfGJ8Y10vaS50ZXN0KG9yZGVyX2xldHRlcik7XHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIHJldHVybiBmYWxzZTtcclxuICB9XHJcbn1cclxuXHJcbmV4cG9ydHMuaGFzRW5vdWdoVW5pdHMgPSBmdW5jdGlvbiAodW5pdHMpIHtcclxuICBsZXQgY3VycmVudF91bml0cyA9IG1pbmVyLm1pbmVDdXJyZW50VW5pdHMoKTtcclxuICBcclxuICByZXR1cm4gXy5hbGwoXy5tYXAoXy5rZXlzKHVuaXRzKSwgZnVuY3Rpb24oaykgeyByZXR1cm4gY3VycmVudF91bml0c1trXSA+PSB1bml0c1trXTsgfSkpO1xyXG59Il19
