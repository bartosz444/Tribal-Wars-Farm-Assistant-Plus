// ==UserScript==
// @name          TW Farm Assistant Plus
// @namespace     https://github.com/sindresorhus/cssprettifier-userscript
// @version       0.9
// @description   One click farm helper for Tribal Wars.
// @author        TheVTM
// @require       https://cdnjs.cloudflare.com/ajax/libs/lodash.js/3.10.1/lodash.js
// @match         *://*.tribalwars.com.br/game.php?*screen=am_farm*
// @downloadURL   https://github.com/thevtm/Tribal-Wars-Farm-Assistant-Plus/raw/master/build/TribalWarsFAP.user.js
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
        return false;
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

      return true;
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
    try {
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
    } catch (err) {
      log.warn("Unable to mine plunderable village", element, err);
    }
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
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnVmZmVyL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2J1ZmZlci9ub2RlX21vZHVsZXMvYmFzZTY0LWpzL2xpYi9iNjQuanMiLCJub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnVmZmVyL25vZGVfbW9kdWxlcy9pZWVlNzU0L2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2J1ZmZlci9ub2RlX21vZHVsZXMvaXMtYXJyYXkvaW5kZXguanMiLCJub2RlX21vZHVsZXMvamF2YXNjcmlwdC1zdGF0ZS1tYWNoaW5lL3N0YXRlLW1hY2hpbmUuanMiLCJub2RlX21vZHVsZXMvbG9nbGV2ZWwvbGliL2xvZ2xldmVsLmpzIiwiQzovVXNlcnMvVlRNL0RvY3VtZW50cy9UcmliYWwgV2Fycy9UcmliYWwtV2Fycy1GYXJtLUFzc2lzdGFudC1QbHVzL3NyYy9qcy9ib3QuanMiLCJDOi9Vc2Vycy9WVE0vRG9jdW1lbnRzL1RyaWJhbCBXYXJzL1RyaWJhbC1XYXJzLUZhcm0tQXNzaXN0YW50LVBsdXMvc3JjL2pzL2NvbnN0LmpzIiwiQzovVXNlcnMvVlRNL0RvY3VtZW50cy9UcmliYWwgV2Fycy9UcmliYWwtV2Fycy1GYXJtLUFzc2lzdGFudC1QbHVzL3NyYy9qcy9kYXRhL2JvdC1vcmRlci5qcyIsIkM6L1VzZXJzL1ZUTS9Eb2N1bWVudHMvVHJpYmFsIFdhcnMvVHJpYmFsLVdhcnMtRmFybS1Bc3Npc3RhbnQtUGx1cy9zcmMvanMvZGF0YS9wbHVuZGVyYWJsZS12aWxsYWdlLmpzIiwiQzovVXNlcnMvVlRNL0RvY3VtZW50cy9UcmliYWwgV2Fycy9UcmliYWwtV2Fycy1GYXJtLUFzc2lzdGFudC1QbHVzL3NyYy9qcy9pbmRleC5qcyIsIkM6L1VzZXJzL1ZUTS9Eb2N1bWVudHMvVHJpYmFsIFdhcnMvVHJpYmFsLVdhcnMtRmFybS1Bc3Npc3RhbnQtUGx1cy9zcmMvanMvbWluZXIuanMiLCJDOi9Vc2Vycy9WVE0vRG9jdW1lbnRzL1RyaWJhbCBXYXJzL1RyaWJhbC1XYXJzLUZhcm0tQXNzaXN0YW50LVBsdXMvc3JjL2pzL3NldHRpbmdzLmpzIiwiQzovVXNlcnMvVlRNL0RvY3VtZW50cy9UcmliYWwgV2Fycy9UcmliYWwtV2Fycy1GYXJtLUFzc2lzdGFudC1QbHVzL3NyYy9qcy9zdG9yYWdlLmpzIiwiQzovVXNlcnMvVlRNL0RvY3VtZW50cy9UcmliYWwgV2Fycy9UcmliYWwtV2Fycy1GYXJtLUFzc2lzdGFudC1QbHVzL3NyYy9qcy91aS5qcyIsIkM6L1VzZXJzL1ZUTS9Eb2N1bWVudHMvVHJpYmFsIFdhcnMvVHJpYmFsLVdhcnMtRmFybS1Bc3Npc3RhbnQtUGx1cy9zcmMvanMvdXRpbC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUN4Z0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25PQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7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QUMsU0FBUyxFQUFFLENBQUMsRUFBRSxDQUFDO0tBQ3BCO0dBQ0YsRUFDSCxJQUFJLENBQUMsQ0FBQztDQUNQLENBQUE7O0FBRUQsT0FBTyxDQUFDLGtCQUFrQixHQUFHLFVBQVUsWUFBWSxFQUFFO0FBQ25ELE1BQUk7QUFDRixXQUFPLE9BQU8sWUFBWSxLQUFLLFFBQVEsSUFDckMsWUFBWSxDQUFDLE1BQU0sS0FBSyxDQUFDLElBQ3pCLFVBQVUsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7R0FDakMsQ0FBQyxPQUFPLEtBQUssRUFBRTtBQUNkLFdBQU8sS0FBSyxDQUFDO0dBQ2Q7Q0FDRixDQUFBOztBQUVELE9BQU8sQ0FBQyxjQUFjLEdBQUcsVUFBVSxLQUFLLEVBQUU7QUFDeEMsTUFBSSxhQUFhLEdBQUcsS0FBSyxDQUFDLGdCQUFnQixFQUFFLENBQUM7O0FBRTdDLFNBQU8sQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsVUFBUyxDQUFDLEVBQUU7QUFBRSxXQUFPLGFBQWEsQ0FBQyxDQUFDLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7R0FBRSxDQUFDLENBQUMsQ0FBQztDQUMxRixDQUFBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIi8qIVxuICogVGhlIGJ1ZmZlciBtb2R1bGUgZnJvbSBub2RlLmpzLCBmb3IgdGhlIGJyb3dzZXIuXG4gKlxuICogQGF1dGhvciAgIEZlcm9zcyBBYm91a2hhZGlqZWggPGZlcm9zc0BmZXJvc3Mub3JnPiA8aHR0cDovL2Zlcm9zcy5vcmc+XG4gKiBAbGljZW5zZSAgTUlUXG4gKi9cbi8qIGVzbGludC1kaXNhYmxlIG5vLXByb3RvICovXG5cbnZhciBiYXNlNjQgPSByZXF1aXJlKCdiYXNlNjQtanMnKVxudmFyIGllZWU3NTQgPSByZXF1aXJlKCdpZWVlNzU0JylcbnZhciBpc0FycmF5ID0gcmVxdWlyZSgnaXMtYXJyYXknKVxuXG5leHBvcnRzLkJ1ZmZlciA9IEJ1ZmZlclxuZXhwb3J0cy5TbG93QnVmZmVyID0gU2xvd0J1ZmZlclxuZXhwb3J0cy5JTlNQRUNUX01BWF9CWVRFUyA9IDUwXG5CdWZmZXIucG9vbFNpemUgPSA4MTkyIC8vIG5vdCB1c2VkIGJ5IHRoaXMgaW1wbGVtZW50YXRpb25cblxudmFyIHJvb3RQYXJlbnQgPSB7fVxuXG4vKipcbiAqIElmIGBCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVGA6XG4gKiAgID09PSB0cnVlICAgIFVzZSBVaW50OEFycmF5IGltcGxlbWVudGF0aW9uIChmYXN0ZXN0KVxuICogICA9PT0gZmFsc2UgICBVc2UgT2JqZWN0IGltcGxlbWVudGF0aW9uIChtb3N0IGNvbXBhdGlibGUsIGV2ZW4gSUU2KVxuICpcbiAqIEJyb3dzZXJzIHRoYXQgc3VwcG9ydCB0eXBlZCBhcnJheXMgYXJlIElFIDEwKywgRmlyZWZveCA0KywgQ2hyb21lIDcrLCBTYWZhcmkgNS4xKyxcbiAqIE9wZXJhIDExLjYrLCBpT1MgNC4yKy5cbiAqXG4gKiBEdWUgdG8gdmFyaW91cyBicm93c2VyIGJ1Z3MsIHNvbWV0aW1lcyB0aGUgT2JqZWN0IGltcGxlbWVudGF0aW9uIHdpbGwgYmUgdXNlZCBldmVuXG4gKiB3aGVuIHRoZSBicm93c2VyIHN1cHBvcnRzIHR5cGVkIGFycmF5cy5cbiAqXG4gKiBOb3RlOlxuICpcbiAqICAgLSBGaXJlZm94IDQtMjkgbGFja3Mgc3VwcG9ydCBmb3IgYWRkaW5nIG5ldyBwcm9wZXJ0aWVzIHRvIGBVaW50OEFycmF5YCBpbnN0YW5jZXMsXG4gKiAgICAgU2VlOiBodHRwczovL2J1Z3ppbGxhLm1vemlsbGEub3JnL3Nob3dfYnVnLmNnaT9pZD02OTU0MzguXG4gKlxuICogICAtIFNhZmFyaSA1LTcgbGFja3Mgc3VwcG9ydCBmb3IgY2hhbmdpbmcgdGhlIGBPYmplY3QucHJvdG90eXBlLmNvbnN0cnVjdG9yYCBwcm9wZXJ0eVxuICogICAgIG9uIG9iamVjdHMuXG4gKlxuICogICAtIENocm9tZSA5LTEwIGlzIG1pc3NpbmcgdGhlIGBUeXBlZEFycmF5LnByb3RvdHlwZS5zdWJhcnJheWAgZnVuY3Rpb24uXG4gKlxuICogICAtIElFMTAgaGFzIGEgYnJva2VuIGBUeXBlZEFycmF5LnByb3RvdHlwZS5zdWJhcnJheWAgZnVuY3Rpb24gd2hpY2ggcmV0dXJucyBhcnJheXMgb2ZcbiAqICAgICBpbmNvcnJlY3QgbGVuZ3RoIGluIHNvbWUgc2l0dWF0aW9ucy5cblxuICogV2UgZGV0ZWN0IHRoZXNlIGJ1Z2d5IGJyb3dzZXJzIGFuZCBzZXQgYEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUYCB0byBgZmFsc2VgIHNvIHRoZXlcbiAqIGdldCB0aGUgT2JqZWN0IGltcGxlbWVudGF0aW9uLCB3aGljaCBpcyBzbG93ZXIgYnV0IGJlaGF2ZXMgY29ycmVjdGx5LlxuICovXG5CdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCA9IGdsb2JhbC5UWVBFRF9BUlJBWV9TVVBQT1JUICE9PSB1bmRlZmluZWRcbiAgPyBnbG9iYWwuVFlQRURfQVJSQVlfU1VQUE9SVFxuICA6IHR5cGVkQXJyYXlTdXBwb3J0KClcblxuZnVuY3Rpb24gdHlwZWRBcnJheVN1cHBvcnQgKCkge1xuICBmdW5jdGlvbiBCYXIgKCkge31cbiAgdHJ5IHtcbiAgICB2YXIgYXJyID0gbmV3IFVpbnQ4QXJyYXkoMSlcbiAgICBhcnIuZm9vID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gNDIgfVxuICAgIGFyci5jb25zdHJ1Y3RvciA9IEJhclxuICAgIHJldHVybiBhcnIuZm9vKCkgPT09IDQyICYmIC8vIHR5cGVkIGFycmF5IGluc3RhbmNlcyBjYW4gYmUgYXVnbWVudGVkXG4gICAgICAgIGFyci5jb25zdHJ1Y3RvciA9PT0gQmFyICYmIC8vIGNvbnN0cnVjdG9yIGNhbiBiZSBzZXRcbiAgICAgICAgdHlwZW9mIGFyci5zdWJhcnJheSA9PT0gJ2Z1bmN0aW9uJyAmJiAvLyBjaHJvbWUgOS0xMCBsYWNrIGBzdWJhcnJheWBcbiAgICAgICAgYXJyLnN1YmFycmF5KDEsIDEpLmJ5dGVMZW5ndGggPT09IDAgLy8gaWUxMCBoYXMgYnJva2VuIGBzdWJhcnJheWBcbiAgfSBjYXRjaCAoZSkge1xuICAgIHJldHVybiBmYWxzZVxuICB9XG59XG5cbmZ1bmN0aW9uIGtNYXhMZW5ndGggKCkge1xuICByZXR1cm4gQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlRcbiAgICA/IDB4N2ZmZmZmZmZcbiAgICA6IDB4M2ZmZmZmZmZcbn1cblxuLyoqXG4gKiBDbGFzczogQnVmZmVyXG4gKiA9PT09PT09PT09PT09XG4gKlxuICogVGhlIEJ1ZmZlciBjb25zdHJ1Y3RvciByZXR1cm5zIGluc3RhbmNlcyBvZiBgVWludDhBcnJheWAgdGhhdCBhcmUgYXVnbWVudGVkXG4gKiB3aXRoIGZ1bmN0aW9uIHByb3BlcnRpZXMgZm9yIGFsbCB0aGUgbm9kZSBgQnVmZmVyYCBBUEkgZnVuY3Rpb25zLiBXZSB1c2VcbiAqIGBVaW50OEFycmF5YCBzbyB0aGF0IHNxdWFyZSBicmFja2V0IG5vdGF0aW9uIHdvcmtzIGFzIGV4cGVjdGVkIC0tIGl0IHJldHVybnNcbiAqIGEgc2luZ2xlIG9jdGV0LlxuICpcbiAqIEJ5IGF1Z21lbnRpbmcgdGhlIGluc3RhbmNlcywgd2UgY2FuIGF2b2lkIG1vZGlmeWluZyB0aGUgYFVpbnQ4QXJyYXlgXG4gKiBwcm90b3R5cGUuXG4gKi9cbmZ1bmN0aW9uIEJ1ZmZlciAoYXJnKSB7XG4gIGlmICghKHRoaXMgaW5zdGFuY2VvZiBCdWZmZXIpKSB7XG4gICAgLy8gQXZvaWQgZ29pbmcgdGhyb3VnaCBhbiBBcmd1bWVudHNBZGFwdG9yVHJhbXBvbGluZSBpbiB0aGUgY29tbW9uIGNhc2UuXG4gICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPiAxKSByZXR1cm4gbmV3IEJ1ZmZlcihhcmcsIGFyZ3VtZW50c1sxXSlcbiAgICByZXR1cm4gbmV3IEJ1ZmZlcihhcmcpXG4gIH1cblxuICB0aGlzLmxlbmd0aCA9IDBcbiAgdGhpcy5wYXJlbnQgPSB1bmRlZmluZWRcblxuICAvLyBDb21tb24gY2FzZS5cbiAgaWYgKHR5cGVvZiBhcmcgPT09ICdudW1iZXInKSB7XG4gICAgcmV0dXJuIGZyb21OdW1iZXIodGhpcywgYXJnKVxuICB9XG5cbiAgLy8gU2xpZ2h0bHkgbGVzcyBjb21tb24gY2FzZS5cbiAgaWYgKHR5cGVvZiBhcmcgPT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIGZyb21TdHJpbmcodGhpcywgYXJnLCBhcmd1bWVudHMubGVuZ3RoID4gMSA/IGFyZ3VtZW50c1sxXSA6ICd1dGY4JylcbiAgfVxuXG4gIC8vIFVudXN1YWwuXG4gIHJldHVybiBmcm9tT2JqZWN0KHRoaXMsIGFyZylcbn1cblxuZnVuY3Rpb24gZnJvbU51bWJlciAodGhhdCwgbGVuZ3RoKSB7XG4gIHRoYXQgPSBhbGxvY2F0ZSh0aGF0LCBsZW5ndGggPCAwID8gMCA6IGNoZWNrZWQobGVuZ3RoKSB8IDApXG4gIGlmICghQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICB0aGF0W2ldID0gMFxuICAgIH1cbiAgfVxuICByZXR1cm4gdGhhdFxufVxuXG5mdW5jdGlvbiBmcm9tU3RyaW5nICh0aGF0LCBzdHJpbmcsIGVuY29kaW5nKSB7XG4gIGlmICh0eXBlb2YgZW5jb2RpbmcgIT09ICdzdHJpbmcnIHx8IGVuY29kaW5nID09PSAnJykgZW5jb2RpbmcgPSAndXRmOCdcblxuICAvLyBBc3N1bXB0aW9uOiBieXRlTGVuZ3RoKCkgcmV0dXJuIHZhbHVlIGlzIGFsd2F5cyA8IGtNYXhMZW5ndGguXG4gIHZhciBsZW5ndGggPSBieXRlTGVuZ3RoKHN0cmluZywgZW5jb2RpbmcpIHwgMFxuICB0aGF0ID0gYWxsb2NhdGUodGhhdCwgbGVuZ3RoKVxuXG4gIHRoYXQud3JpdGUoc3RyaW5nLCBlbmNvZGluZylcbiAgcmV0dXJuIHRoYXRcbn1cblxuZnVuY3Rpb24gZnJvbU9iamVjdCAodGhhdCwgb2JqZWN0KSB7XG4gIGlmIChCdWZmZXIuaXNCdWZmZXIob2JqZWN0KSkgcmV0dXJuIGZyb21CdWZmZXIodGhhdCwgb2JqZWN0KVxuXG4gIGlmIChpc0FycmF5KG9iamVjdCkpIHJldHVybiBmcm9tQXJyYXkodGhhdCwgb2JqZWN0KVxuXG4gIGlmIChvYmplY3QgPT0gbnVsbCkge1xuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ211c3Qgc3RhcnQgd2l0aCBudW1iZXIsIGJ1ZmZlciwgYXJyYXkgb3Igc3RyaW5nJylcbiAgfVxuXG4gIGlmICh0eXBlb2YgQXJyYXlCdWZmZXIgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgaWYgKG9iamVjdC5idWZmZXIgaW5zdGFuY2VvZiBBcnJheUJ1ZmZlcikge1xuICAgICAgcmV0dXJuIGZyb21UeXBlZEFycmF5KHRoYXQsIG9iamVjdClcbiAgICB9XG4gICAgaWYgKG9iamVjdCBpbnN0YW5jZW9mIEFycmF5QnVmZmVyKSB7XG4gICAgICByZXR1cm4gZnJvbUFycmF5QnVmZmVyKHRoYXQsIG9iamVjdClcbiAgICB9XG4gIH1cblxuICBpZiAob2JqZWN0Lmxlbmd0aCkgcmV0dXJuIGZyb21BcnJheUxpa2UodGhhdCwgb2JqZWN0KVxuXG4gIHJldHVybiBmcm9tSnNvbk9iamVjdCh0aGF0LCBvYmplY3QpXG59XG5cbmZ1bmN0aW9uIGZyb21CdWZmZXIgKHRoYXQsIGJ1ZmZlcikge1xuICB2YXIgbGVuZ3RoID0gY2hlY2tlZChidWZmZXIubGVuZ3RoKSB8IDBcbiAgdGhhdCA9IGFsbG9jYXRlKHRoYXQsIGxlbmd0aClcbiAgYnVmZmVyLmNvcHkodGhhdCwgMCwgMCwgbGVuZ3RoKVxuICByZXR1cm4gdGhhdFxufVxuXG5mdW5jdGlvbiBmcm9tQXJyYXkgKHRoYXQsIGFycmF5KSB7XG4gIHZhciBsZW5ndGggPSBjaGVja2VkKGFycmF5Lmxlbmd0aCkgfCAwXG4gIHRoYXQgPSBhbGxvY2F0ZSh0aGF0LCBsZW5ndGgpXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpICs9IDEpIHtcbiAgICB0aGF0W2ldID0gYXJyYXlbaV0gJiAyNTVcbiAgfVxuICByZXR1cm4gdGhhdFxufVxuXG4vLyBEdXBsaWNhdGUgb2YgZnJvbUFycmF5KCkgdG8ga2VlcCBmcm9tQXJyYXkoKSBtb25vbW9ycGhpYy5cbmZ1bmN0aW9uIGZyb21UeXBlZEFycmF5ICh0aGF0LCBhcnJheSkge1xuICB2YXIgbGVuZ3RoID0gY2hlY2tlZChhcnJheS5sZW5ndGgpIHwgMFxuICB0aGF0ID0gYWxsb2NhdGUodGhhdCwgbGVuZ3RoKVxuICAvLyBUcnVuY2F0aW5nIHRoZSBlbGVtZW50cyBpcyBwcm9iYWJseSBub3Qgd2hhdCBwZW9wbGUgZXhwZWN0IGZyb20gdHlwZWRcbiAgLy8gYXJyYXlzIHdpdGggQllURVNfUEVSX0VMRU1FTlQgPiAxIGJ1dCBpdCdzIGNvbXBhdGlibGUgd2l0aCB0aGUgYmVoYXZpb3JcbiAgLy8gb2YgdGhlIG9sZCBCdWZmZXIgY29uc3RydWN0b3IuXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpICs9IDEpIHtcbiAgICB0aGF0W2ldID0gYXJyYXlbaV0gJiAyNTVcbiAgfVxuICByZXR1cm4gdGhhdFxufVxuXG5mdW5jdGlvbiBmcm9tQXJyYXlCdWZmZXIgKHRoYXQsIGFycmF5KSB7XG4gIGlmIChCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkge1xuICAgIC8vIFJldHVybiBhbiBhdWdtZW50ZWQgYFVpbnQ4QXJyYXlgIGluc3RhbmNlLCBmb3IgYmVzdCBwZXJmb3JtYW5jZVxuICAgIGFycmF5LmJ5dGVMZW5ndGhcbiAgICB0aGF0ID0gQnVmZmVyLl9hdWdtZW50KG5ldyBVaW50OEFycmF5KGFycmF5KSlcbiAgfSBlbHNlIHtcbiAgICAvLyBGYWxsYmFjazogUmV0dXJuIGFuIG9iamVjdCBpbnN0YW5jZSBvZiB0aGUgQnVmZmVyIGNsYXNzXG4gICAgdGhhdCA9IGZyb21UeXBlZEFycmF5KHRoYXQsIG5ldyBVaW50OEFycmF5KGFycmF5KSlcbiAgfVxuICByZXR1cm4gdGhhdFxufVxuXG5mdW5jdGlvbiBmcm9tQXJyYXlMaWtlICh0aGF0LCBhcnJheSkge1xuICB2YXIgbGVuZ3RoID0gY2hlY2tlZChhcnJheS5sZW5ndGgpIHwgMFxuICB0aGF0ID0gYWxsb2NhdGUodGhhdCwgbGVuZ3RoKVxuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSArPSAxKSB7XG4gICAgdGhhdFtpXSA9IGFycmF5W2ldICYgMjU1XG4gIH1cbiAgcmV0dXJuIHRoYXRcbn1cblxuLy8gRGVzZXJpYWxpemUgeyB0eXBlOiAnQnVmZmVyJywgZGF0YTogWzEsMiwzLC4uLl0gfSBpbnRvIGEgQnVmZmVyIG9iamVjdC5cbi8vIFJldHVybnMgYSB6ZXJvLWxlbmd0aCBidWZmZXIgZm9yIGlucHV0cyB0aGF0IGRvbid0IGNvbmZvcm0gdG8gdGhlIHNwZWMuXG5mdW5jdGlvbiBmcm9tSnNvbk9iamVjdCAodGhhdCwgb2JqZWN0KSB7XG4gIHZhciBhcnJheVxuICB2YXIgbGVuZ3RoID0gMFxuXG4gIGlmIChvYmplY3QudHlwZSA9PT0gJ0J1ZmZlcicgJiYgaXNBcnJheShvYmplY3QuZGF0YSkpIHtcbiAgICBhcnJheSA9IG9iamVjdC5kYXRhXG4gICAgbGVuZ3RoID0gY2hlY2tlZChhcnJheS5sZW5ndGgpIHwgMFxuICB9XG4gIHRoYXQgPSBhbGxvY2F0ZSh0aGF0LCBsZW5ndGgpXG5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkgKz0gMSkge1xuICAgIHRoYXRbaV0gPSBhcnJheVtpXSAmIDI1NVxuICB9XG4gIHJldHVybiB0aGF0XG59XG5cbmlmIChCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkge1xuICBCdWZmZXIucHJvdG90eXBlLl9fcHJvdG9fXyA9IFVpbnQ4QXJyYXkucHJvdG90eXBlXG4gIEJ1ZmZlci5fX3Byb3RvX18gPSBVaW50OEFycmF5XG59XG5cbmZ1bmN0aW9uIGFsbG9jYXRlICh0aGF0LCBsZW5ndGgpIHtcbiAgaWYgKEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUKSB7XG4gICAgLy8gUmV0dXJuIGFuIGF1Z21lbnRlZCBgVWludDhBcnJheWAgaW5zdGFuY2UsIGZvciBiZXN0IHBlcmZvcm1hbmNlXG4gICAgdGhhdCA9IEJ1ZmZlci5fYXVnbWVudChuZXcgVWludDhBcnJheShsZW5ndGgpKVxuICAgIHRoYXQuX19wcm90b19fID0gQnVmZmVyLnByb3RvdHlwZVxuICB9IGVsc2Uge1xuICAgIC8vIEZhbGxiYWNrOiBSZXR1cm4gYW4gb2JqZWN0IGluc3RhbmNlIG9mIHRoZSBCdWZmZXIgY2xhc3NcbiAgICB0aGF0Lmxlbmd0aCA9IGxlbmd0aFxuICAgIHRoYXQuX2lzQnVmZmVyID0gdHJ1ZVxuICB9XG5cbiAgdmFyIGZyb21Qb29sID0gbGVuZ3RoICE9PSAwICYmIGxlbmd0aCA8PSBCdWZmZXIucG9vbFNpemUgPj4+IDFcbiAgaWYgKGZyb21Qb29sKSB0aGF0LnBhcmVudCA9IHJvb3RQYXJlbnRcblxuICByZXR1cm4gdGhhdFxufVxuXG5mdW5jdGlvbiBjaGVja2VkIChsZW5ndGgpIHtcbiAgLy8gTm90ZTogY2Fubm90IHVzZSBgbGVuZ3RoIDwga01heExlbmd0aGAgaGVyZSBiZWNhdXNlIHRoYXQgZmFpbHMgd2hlblxuICAvLyBsZW5ndGggaXMgTmFOICh3aGljaCBpcyBvdGhlcndpc2UgY29lcmNlZCB0byB6ZXJvLilcbiAgaWYgKGxlbmd0aCA+PSBrTWF4TGVuZ3RoKCkpIHtcbiAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcignQXR0ZW1wdCB0byBhbGxvY2F0ZSBCdWZmZXIgbGFyZ2VyIHRoYW4gbWF4aW11bSAnICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAnc2l6ZTogMHgnICsga01heExlbmd0aCgpLnRvU3RyaW5nKDE2KSArICcgYnl0ZXMnKVxuICB9XG4gIHJldHVybiBsZW5ndGggfCAwXG59XG5cbmZ1bmN0aW9uIFNsb3dCdWZmZXIgKHN1YmplY3QsIGVuY29kaW5nKSB7XG4gIGlmICghKHRoaXMgaW5zdGFuY2VvZiBTbG93QnVmZmVyKSkgcmV0dXJuIG5ldyBTbG93QnVmZmVyKHN1YmplY3QsIGVuY29kaW5nKVxuXG4gIHZhciBidWYgPSBuZXcgQnVmZmVyKHN1YmplY3QsIGVuY29kaW5nKVxuICBkZWxldGUgYnVmLnBhcmVudFxuICByZXR1cm4gYnVmXG59XG5cbkJ1ZmZlci5pc0J1ZmZlciA9IGZ1bmN0aW9uIGlzQnVmZmVyIChiKSB7XG4gIHJldHVybiAhIShiICE9IG51bGwgJiYgYi5faXNCdWZmZXIpXG59XG5cbkJ1ZmZlci5jb21wYXJlID0gZnVuY3Rpb24gY29tcGFyZSAoYSwgYikge1xuICBpZiAoIUJ1ZmZlci5pc0J1ZmZlcihhKSB8fCAhQnVmZmVyLmlzQnVmZmVyKGIpKSB7XG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcignQXJndW1lbnRzIG11c3QgYmUgQnVmZmVycycpXG4gIH1cblxuICBpZiAoYSA9PT0gYikgcmV0dXJuIDBcblxuICB2YXIgeCA9IGEubGVuZ3RoXG4gIHZhciB5ID0gYi5sZW5ndGhcblxuICB2YXIgaSA9IDBcbiAgdmFyIGxlbiA9IE1hdGgubWluKHgsIHkpXG4gIHdoaWxlIChpIDwgbGVuKSB7XG4gICAgaWYgKGFbaV0gIT09IGJbaV0pIGJyZWFrXG5cbiAgICArK2lcbiAgfVxuXG4gIGlmIChpICE9PSBsZW4pIHtcbiAgICB4ID0gYVtpXVxuICAgIHkgPSBiW2ldXG4gIH1cblxuICBpZiAoeCA8IHkpIHJldHVybiAtMVxuICBpZiAoeSA8IHgpIHJldHVybiAxXG4gIHJldHVybiAwXG59XG5cbkJ1ZmZlci5pc0VuY29kaW5nID0gZnVuY3Rpb24gaXNFbmNvZGluZyAoZW5jb2RpbmcpIHtcbiAgc3dpdGNoIChTdHJpbmcoZW5jb2RpbmcpLnRvTG93ZXJDYXNlKCkpIHtcbiAgICBjYXNlICdoZXgnOlxuICAgIGNhc2UgJ3V0ZjgnOlxuICAgIGNhc2UgJ3V0Zi04JzpcbiAgICBjYXNlICdhc2NpaSc6XG4gICAgY2FzZSAnYmluYXJ5JzpcbiAgICBjYXNlICdiYXNlNjQnOlxuICAgIGNhc2UgJ3Jhdyc6XG4gICAgY2FzZSAndWNzMic6XG4gICAgY2FzZSAndWNzLTInOlxuICAgIGNhc2UgJ3V0ZjE2bGUnOlxuICAgIGNhc2UgJ3V0Zi0xNmxlJzpcbiAgICAgIHJldHVybiB0cnVlXG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiBmYWxzZVxuICB9XG59XG5cbkJ1ZmZlci5jb25jYXQgPSBmdW5jdGlvbiBjb25jYXQgKGxpc3QsIGxlbmd0aCkge1xuICBpZiAoIWlzQXJyYXkobGlzdCkpIHRocm93IG5ldyBUeXBlRXJyb3IoJ2xpc3QgYXJndW1lbnQgbXVzdCBiZSBhbiBBcnJheSBvZiBCdWZmZXJzLicpXG5cbiAgaWYgKGxpc3QubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIG5ldyBCdWZmZXIoMClcbiAgfVxuXG4gIHZhciBpXG4gIGlmIChsZW5ndGggPT09IHVuZGVmaW5lZCkge1xuICAgIGxlbmd0aCA9IDBcbiAgICBmb3IgKGkgPSAwOyBpIDwgbGlzdC5sZW5ndGg7IGkrKykge1xuICAgICAgbGVuZ3RoICs9IGxpc3RbaV0ubGVuZ3RoXG4gICAgfVxuICB9XG5cbiAgdmFyIGJ1ZiA9IG5ldyBCdWZmZXIobGVuZ3RoKVxuICB2YXIgcG9zID0gMFxuICBmb3IgKGkgPSAwOyBpIDwgbGlzdC5sZW5ndGg7IGkrKykge1xuICAgIHZhciBpdGVtID0gbGlzdFtpXVxuICAgIGl0ZW0uY29weShidWYsIHBvcylcbiAgICBwb3MgKz0gaXRlbS5sZW5ndGhcbiAgfVxuICByZXR1cm4gYnVmXG59XG5cbmZ1bmN0aW9uIGJ5dGVMZW5ndGggKHN0cmluZywgZW5jb2RpbmcpIHtcbiAgaWYgKHR5cGVvZiBzdHJpbmcgIT09ICdzdHJpbmcnKSBzdHJpbmcgPSAnJyArIHN0cmluZ1xuXG4gIHZhciBsZW4gPSBzdHJpbmcubGVuZ3RoXG4gIGlmIChsZW4gPT09IDApIHJldHVybiAwXG5cbiAgLy8gVXNlIGEgZm9yIGxvb3AgdG8gYXZvaWQgcmVjdXJzaW9uXG4gIHZhciBsb3dlcmVkQ2FzZSA9IGZhbHNlXG4gIGZvciAoOzspIHtcbiAgICBzd2l0Y2ggKGVuY29kaW5nKSB7XG4gICAgICBjYXNlICdhc2NpaSc6XG4gICAgICBjYXNlICdiaW5hcnknOlxuICAgICAgLy8gRGVwcmVjYXRlZFxuICAgICAgY2FzZSAncmF3JzpcbiAgICAgIGNhc2UgJ3Jhd3MnOlxuICAgICAgICByZXR1cm4gbGVuXG4gICAgICBjYXNlICd1dGY4JzpcbiAgICAgIGNhc2UgJ3V0Zi04JzpcbiAgICAgICAgcmV0dXJuIHV0ZjhUb0J5dGVzKHN0cmluZykubGVuZ3RoXG4gICAgICBjYXNlICd1Y3MyJzpcbiAgICAgIGNhc2UgJ3Vjcy0yJzpcbiAgICAgIGNhc2UgJ3V0ZjE2bGUnOlxuICAgICAgY2FzZSAndXRmLTE2bGUnOlxuICAgICAgICByZXR1cm4gbGVuICogMlxuICAgICAgY2FzZSAnaGV4JzpcbiAgICAgICAgcmV0dXJuIGxlbiA+Pj4gMVxuICAgICAgY2FzZSAnYmFzZTY0JzpcbiAgICAgICAgcmV0dXJuIGJhc2U2NFRvQnl0ZXMoc3RyaW5nKS5sZW5ndGhcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIGlmIChsb3dlcmVkQ2FzZSkgcmV0dXJuIHV0ZjhUb0J5dGVzKHN0cmluZykubGVuZ3RoIC8vIGFzc3VtZSB1dGY4XG4gICAgICAgIGVuY29kaW5nID0gKCcnICsgZW5jb2RpbmcpLnRvTG93ZXJDYXNlKClcbiAgICAgICAgbG93ZXJlZENhc2UgPSB0cnVlXG4gICAgfVxuICB9XG59XG5CdWZmZXIuYnl0ZUxlbmd0aCA9IGJ5dGVMZW5ndGhcblxuLy8gcHJlLXNldCBmb3IgdmFsdWVzIHRoYXQgbWF5IGV4aXN0IGluIHRoZSBmdXR1cmVcbkJ1ZmZlci5wcm90b3R5cGUubGVuZ3RoID0gdW5kZWZpbmVkXG5CdWZmZXIucHJvdG90eXBlLnBhcmVudCA9IHVuZGVmaW5lZFxuXG5mdW5jdGlvbiBzbG93VG9TdHJpbmcgKGVuY29kaW5nLCBzdGFydCwgZW5kKSB7XG4gIHZhciBsb3dlcmVkQ2FzZSA9IGZhbHNlXG5cbiAgc3RhcnQgPSBzdGFydCB8IDBcbiAgZW5kID0gZW5kID09PSB1bmRlZmluZWQgfHwgZW5kID09PSBJbmZpbml0eSA/IHRoaXMubGVuZ3RoIDogZW5kIHwgMFxuXG4gIGlmICghZW5jb2RpbmcpIGVuY29kaW5nID0gJ3V0ZjgnXG4gIGlmIChzdGFydCA8IDApIHN0YXJ0ID0gMFxuICBpZiAoZW5kID4gdGhpcy5sZW5ndGgpIGVuZCA9IHRoaXMubGVuZ3RoXG4gIGlmIChlbmQgPD0gc3RhcnQpIHJldHVybiAnJ1xuXG4gIHdoaWxlICh0cnVlKSB7XG4gICAgc3dpdGNoIChlbmNvZGluZykge1xuICAgICAgY2FzZSAnaGV4JzpcbiAgICAgICAgcmV0dXJuIGhleFNsaWNlKHRoaXMsIHN0YXJ0LCBlbmQpXG5cbiAgICAgIGNhc2UgJ3V0ZjgnOlxuICAgICAgY2FzZSAndXRmLTgnOlxuICAgICAgICByZXR1cm4gdXRmOFNsaWNlKHRoaXMsIHN0YXJ0LCBlbmQpXG5cbiAgICAgIGNhc2UgJ2FzY2lpJzpcbiAgICAgICAgcmV0dXJuIGFzY2lpU2xpY2UodGhpcywgc3RhcnQsIGVuZClcblxuICAgICAgY2FzZSAnYmluYXJ5JzpcbiAgICAgICAgcmV0dXJuIGJpbmFyeVNsaWNlKHRoaXMsIHN0YXJ0LCBlbmQpXG5cbiAgICAgIGNhc2UgJ2Jhc2U2NCc6XG4gICAgICAgIHJldHVybiBiYXNlNjRTbGljZSh0aGlzLCBzdGFydCwgZW5kKVxuXG4gICAgICBjYXNlICd1Y3MyJzpcbiAgICAgIGNhc2UgJ3Vjcy0yJzpcbiAgICAgIGNhc2UgJ3V0ZjE2bGUnOlxuICAgICAgY2FzZSAndXRmLTE2bGUnOlxuICAgICAgICByZXR1cm4gdXRmMTZsZVNsaWNlKHRoaXMsIHN0YXJ0LCBlbmQpXG5cbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIGlmIChsb3dlcmVkQ2FzZSkgdGhyb3cgbmV3IFR5cGVFcnJvcignVW5rbm93biBlbmNvZGluZzogJyArIGVuY29kaW5nKVxuICAgICAgICBlbmNvZGluZyA9IChlbmNvZGluZyArICcnKS50b0xvd2VyQ2FzZSgpXG4gICAgICAgIGxvd2VyZWRDYXNlID0gdHJ1ZVxuICAgIH1cbiAgfVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24gdG9TdHJpbmcgKCkge1xuICB2YXIgbGVuZ3RoID0gdGhpcy5sZW5ndGggfCAwXG4gIGlmIChsZW5ndGggPT09IDApIHJldHVybiAnJ1xuICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIHV0ZjhTbGljZSh0aGlzLCAwLCBsZW5ndGgpXG4gIHJldHVybiBzbG93VG9TdHJpbmcuYXBwbHkodGhpcywgYXJndW1lbnRzKVxufVxuXG5CdWZmZXIucHJvdG90eXBlLmVxdWFscyA9IGZ1bmN0aW9uIGVxdWFscyAoYikge1xuICBpZiAoIUJ1ZmZlci5pc0J1ZmZlcihiKSkgdGhyb3cgbmV3IFR5cGVFcnJvcignQXJndW1lbnQgbXVzdCBiZSBhIEJ1ZmZlcicpXG4gIGlmICh0aGlzID09PSBiKSByZXR1cm4gdHJ1ZVxuICByZXR1cm4gQnVmZmVyLmNvbXBhcmUodGhpcywgYikgPT09IDBcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5pbnNwZWN0ID0gZnVuY3Rpb24gaW5zcGVjdCAoKSB7XG4gIHZhciBzdHIgPSAnJ1xuICB2YXIgbWF4ID0gZXhwb3J0cy5JTlNQRUNUX01BWF9CWVRFU1xuICBpZiAodGhpcy5sZW5ndGggPiAwKSB7XG4gICAgc3RyID0gdGhpcy50b1N0cmluZygnaGV4JywgMCwgbWF4KS5tYXRjaCgvLnsyfS9nKS5qb2luKCcgJylcbiAgICBpZiAodGhpcy5sZW5ndGggPiBtYXgpIHN0ciArPSAnIC4uLiAnXG4gIH1cbiAgcmV0dXJuICc8QnVmZmVyICcgKyBzdHIgKyAnPidcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5jb21wYXJlID0gZnVuY3Rpb24gY29tcGFyZSAoYikge1xuICBpZiAoIUJ1ZmZlci5pc0J1ZmZlcihiKSkgdGhyb3cgbmV3IFR5cGVFcnJvcignQXJndW1lbnQgbXVzdCBiZSBhIEJ1ZmZlcicpXG4gIGlmICh0aGlzID09PSBiKSByZXR1cm4gMFxuICByZXR1cm4gQnVmZmVyLmNvbXBhcmUodGhpcywgYilcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5pbmRleE9mID0gZnVuY3Rpb24gaW5kZXhPZiAodmFsLCBieXRlT2Zmc2V0KSB7XG4gIGlmIChieXRlT2Zmc2V0ID4gMHg3ZmZmZmZmZikgYnl0ZU9mZnNldCA9IDB4N2ZmZmZmZmZcbiAgZWxzZSBpZiAoYnl0ZU9mZnNldCA8IC0weDgwMDAwMDAwKSBieXRlT2Zmc2V0ID0gLTB4ODAwMDAwMDBcbiAgYnl0ZU9mZnNldCA+Pj0gMFxuXG4gIGlmICh0aGlzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIC0xXG4gIGlmIChieXRlT2Zmc2V0ID49IHRoaXMubGVuZ3RoKSByZXR1cm4gLTFcblxuICAvLyBOZWdhdGl2ZSBvZmZzZXRzIHN0YXJ0IGZyb20gdGhlIGVuZCBvZiB0aGUgYnVmZmVyXG4gIGlmIChieXRlT2Zmc2V0IDwgMCkgYnl0ZU9mZnNldCA9IE1hdGgubWF4KHRoaXMubGVuZ3RoICsgYnl0ZU9mZnNldCwgMClcblxuICBpZiAodHlwZW9mIHZhbCA9PT0gJ3N0cmluZycpIHtcbiAgICBpZiAodmFsLmxlbmd0aCA9PT0gMCkgcmV0dXJuIC0xIC8vIHNwZWNpYWwgY2FzZTogbG9va2luZyBmb3IgZW1wdHkgc3RyaW5nIGFsd2F5cyBmYWlsc1xuICAgIHJldHVybiBTdHJpbmcucHJvdG90eXBlLmluZGV4T2YuY2FsbCh0aGlzLCB2YWwsIGJ5dGVPZmZzZXQpXG4gIH1cbiAgaWYgKEJ1ZmZlci5pc0J1ZmZlcih2YWwpKSB7XG4gICAgcmV0dXJuIGFycmF5SW5kZXhPZih0aGlzLCB2YWwsIGJ5dGVPZmZzZXQpXG4gIH1cbiAgaWYgKHR5cGVvZiB2YWwgPT09ICdudW1iZXInKSB7XG4gICAgaWYgKEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUICYmIFVpbnQ4QXJyYXkucHJvdG90eXBlLmluZGV4T2YgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHJldHVybiBVaW50OEFycmF5LnByb3RvdHlwZS5pbmRleE9mLmNhbGwodGhpcywgdmFsLCBieXRlT2Zmc2V0KVxuICAgIH1cbiAgICByZXR1cm4gYXJyYXlJbmRleE9mKHRoaXMsIFsgdmFsIF0sIGJ5dGVPZmZzZXQpXG4gIH1cblxuICBmdW5jdGlvbiBhcnJheUluZGV4T2YgKGFyciwgdmFsLCBieXRlT2Zmc2V0KSB7XG4gICAgdmFyIGZvdW5kSW5kZXggPSAtMVxuICAgIGZvciAodmFyIGkgPSAwOyBieXRlT2Zmc2V0ICsgaSA8IGFyci5sZW5ndGg7IGkrKykge1xuICAgICAgaWYgKGFycltieXRlT2Zmc2V0ICsgaV0gPT09IHZhbFtmb3VuZEluZGV4ID09PSAtMSA/IDAgOiBpIC0gZm91bmRJbmRleF0pIHtcbiAgICAgICAgaWYgKGZvdW5kSW5kZXggPT09IC0xKSBmb3VuZEluZGV4ID0gaVxuICAgICAgICBpZiAoaSAtIGZvdW5kSW5kZXggKyAxID09PSB2YWwubGVuZ3RoKSByZXR1cm4gYnl0ZU9mZnNldCArIGZvdW5kSW5kZXhcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGZvdW5kSW5kZXggPSAtMVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gLTFcbiAgfVxuXG4gIHRocm93IG5ldyBUeXBlRXJyb3IoJ3ZhbCBtdXN0IGJlIHN0cmluZywgbnVtYmVyIG9yIEJ1ZmZlcicpXG59XG5cbi8vIGBnZXRgIGlzIGRlcHJlY2F0ZWRcbkJ1ZmZlci5wcm90b3R5cGUuZ2V0ID0gZnVuY3Rpb24gZ2V0IChvZmZzZXQpIHtcbiAgY29uc29sZS5sb2coJy5nZXQoKSBpcyBkZXByZWNhdGVkLiBBY2Nlc3MgdXNpbmcgYXJyYXkgaW5kZXhlcyBpbnN0ZWFkLicpXG4gIHJldHVybiB0aGlzLnJlYWRVSW50OChvZmZzZXQpXG59XG5cbi8vIGBzZXRgIGlzIGRlcHJlY2F0ZWRcbkJ1ZmZlci5wcm90b3R5cGUuc2V0ID0gZnVuY3Rpb24gc2V0ICh2LCBvZmZzZXQpIHtcbiAgY29uc29sZS5sb2coJy5zZXQoKSBpcyBkZXByZWNhdGVkLiBBY2Nlc3MgdXNpbmcgYXJyYXkgaW5kZXhlcyBpbnN0ZWFkLicpXG4gIHJldHVybiB0aGlzLndyaXRlVUludDgodiwgb2Zmc2V0KVxufVxuXG5mdW5jdGlvbiBoZXhXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIG9mZnNldCA9IE51bWJlcihvZmZzZXQpIHx8IDBcbiAgdmFyIHJlbWFpbmluZyA9IGJ1Zi5sZW5ndGggLSBvZmZzZXRcbiAgaWYgKCFsZW5ndGgpIHtcbiAgICBsZW5ndGggPSByZW1haW5pbmdcbiAgfSBlbHNlIHtcbiAgICBsZW5ndGggPSBOdW1iZXIobGVuZ3RoKVxuICAgIGlmIChsZW5ndGggPiByZW1haW5pbmcpIHtcbiAgICAgIGxlbmd0aCA9IHJlbWFpbmluZ1xuICAgIH1cbiAgfVxuXG4gIC8vIG11c3QgYmUgYW4gZXZlbiBudW1iZXIgb2YgZGlnaXRzXG4gIHZhciBzdHJMZW4gPSBzdHJpbmcubGVuZ3RoXG4gIGlmIChzdHJMZW4gJSAyICE9PSAwKSB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgaGV4IHN0cmluZycpXG5cbiAgaWYgKGxlbmd0aCA+IHN0ckxlbiAvIDIpIHtcbiAgICBsZW5ndGggPSBzdHJMZW4gLyAyXG4gIH1cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgIHZhciBwYXJzZWQgPSBwYXJzZUludChzdHJpbmcuc3Vic3RyKGkgKiAyLCAyKSwgMTYpXG4gICAgaWYgKGlzTmFOKHBhcnNlZCkpIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBoZXggc3RyaW5nJylcbiAgICBidWZbb2Zmc2V0ICsgaV0gPSBwYXJzZWRcbiAgfVxuICByZXR1cm4gaVxufVxuXG5mdW5jdGlvbiB1dGY4V3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICByZXR1cm4gYmxpdEJ1ZmZlcih1dGY4VG9CeXRlcyhzdHJpbmcsIGJ1Zi5sZW5ndGggLSBvZmZzZXQpLCBidWYsIG9mZnNldCwgbGVuZ3RoKVxufVxuXG5mdW5jdGlvbiBhc2NpaVdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgcmV0dXJuIGJsaXRCdWZmZXIoYXNjaWlUb0J5dGVzKHN0cmluZyksIGJ1Ziwgb2Zmc2V0LCBsZW5ndGgpXG59XG5cbmZ1bmN0aW9uIGJpbmFyeVdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgcmV0dXJuIGFzY2lpV3JpdGUoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxufVxuXG5mdW5jdGlvbiBiYXNlNjRXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHJldHVybiBibGl0QnVmZmVyKGJhc2U2NFRvQnl0ZXMoc3RyaW5nKSwgYnVmLCBvZmZzZXQsIGxlbmd0aClcbn1cblxuZnVuY3Rpb24gdWNzMldyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgcmV0dXJuIGJsaXRCdWZmZXIodXRmMTZsZVRvQnl0ZXMoc3RyaW5nLCBidWYubGVuZ3RoIC0gb2Zmc2V0KSwgYnVmLCBvZmZzZXQsIGxlbmd0aClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZSA9IGZ1bmN0aW9uIHdyaXRlIChzdHJpbmcsIG9mZnNldCwgbGVuZ3RoLCBlbmNvZGluZykge1xuICAvLyBCdWZmZXIjd3JpdGUoc3RyaW5nKVxuICBpZiAob2Zmc2V0ID09PSB1bmRlZmluZWQpIHtcbiAgICBlbmNvZGluZyA9ICd1dGY4J1xuICAgIGxlbmd0aCA9IHRoaXMubGVuZ3RoXG4gICAgb2Zmc2V0ID0gMFxuICAvLyBCdWZmZXIjd3JpdGUoc3RyaW5nLCBlbmNvZGluZylcbiAgfSBlbHNlIGlmIChsZW5ndGggPT09IHVuZGVmaW5lZCAmJiB0eXBlb2Ygb2Zmc2V0ID09PSAnc3RyaW5nJykge1xuICAgIGVuY29kaW5nID0gb2Zmc2V0XG4gICAgbGVuZ3RoID0gdGhpcy5sZW5ndGhcbiAgICBvZmZzZXQgPSAwXG4gIC8vIEJ1ZmZlciN3cml0ZShzdHJpbmcsIG9mZnNldFssIGxlbmd0aF1bLCBlbmNvZGluZ10pXG4gIH0gZWxzZSBpZiAoaXNGaW5pdGUob2Zmc2V0KSkge1xuICAgIG9mZnNldCA9IG9mZnNldCB8IDBcbiAgICBpZiAoaXNGaW5pdGUobGVuZ3RoKSkge1xuICAgICAgbGVuZ3RoID0gbGVuZ3RoIHwgMFxuICAgICAgaWYgKGVuY29kaW5nID09PSB1bmRlZmluZWQpIGVuY29kaW5nID0gJ3V0ZjgnXG4gICAgfSBlbHNlIHtcbiAgICAgIGVuY29kaW5nID0gbGVuZ3RoXG4gICAgICBsZW5ndGggPSB1bmRlZmluZWRcbiAgICB9XG4gIC8vIGxlZ2FjeSB3cml0ZShzdHJpbmcsIGVuY29kaW5nLCBvZmZzZXQsIGxlbmd0aCkgLSByZW1vdmUgaW4gdjAuMTNcbiAgfSBlbHNlIHtcbiAgICB2YXIgc3dhcCA9IGVuY29kaW5nXG4gICAgZW5jb2RpbmcgPSBvZmZzZXRcbiAgICBvZmZzZXQgPSBsZW5ndGggfCAwXG4gICAgbGVuZ3RoID0gc3dhcFxuICB9XG5cbiAgdmFyIHJlbWFpbmluZyA9IHRoaXMubGVuZ3RoIC0gb2Zmc2V0XG4gIGlmIChsZW5ndGggPT09IHVuZGVmaW5lZCB8fCBsZW5ndGggPiByZW1haW5pbmcpIGxlbmd0aCA9IHJlbWFpbmluZ1xuXG4gIGlmICgoc3RyaW5nLmxlbmd0aCA+IDAgJiYgKGxlbmd0aCA8IDAgfHwgb2Zmc2V0IDwgMCkpIHx8IG9mZnNldCA+IHRoaXMubGVuZ3RoKSB7XG4gICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ2F0dGVtcHQgdG8gd3JpdGUgb3V0c2lkZSBidWZmZXIgYm91bmRzJylcbiAgfVxuXG4gIGlmICghZW5jb2RpbmcpIGVuY29kaW5nID0gJ3V0ZjgnXG5cbiAgdmFyIGxvd2VyZWRDYXNlID0gZmFsc2VcbiAgZm9yICg7Oykge1xuICAgIHN3aXRjaCAoZW5jb2RpbmcpIHtcbiAgICAgIGNhc2UgJ2hleCc6XG4gICAgICAgIHJldHVybiBoZXhXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuXG4gICAgICBjYXNlICd1dGY4JzpcbiAgICAgIGNhc2UgJ3V0Zi04JzpcbiAgICAgICAgcmV0dXJuIHV0ZjhXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuXG4gICAgICBjYXNlICdhc2NpaSc6XG4gICAgICAgIHJldHVybiBhc2NpaVdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG5cbiAgICAgIGNhc2UgJ2JpbmFyeSc6XG4gICAgICAgIHJldHVybiBiaW5hcnlXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuXG4gICAgICBjYXNlICdiYXNlNjQnOlxuICAgICAgICAvLyBXYXJuaW5nOiBtYXhMZW5ndGggbm90IHRha2VuIGludG8gYWNjb3VudCBpbiBiYXNlNjRXcml0ZVxuICAgICAgICByZXR1cm4gYmFzZTY0V3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcblxuICAgICAgY2FzZSAndWNzMic6XG4gICAgICBjYXNlICd1Y3MtMic6XG4gICAgICBjYXNlICd1dGYxNmxlJzpcbiAgICAgIGNhc2UgJ3V0Zi0xNmxlJzpcbiAgICAgICAgcmV0dXJuIHVjczJXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuXG4gICAgICBkZWZhdWx0OlxuICAgICAgICBpZiAobG93ZXJlZENhc2UpIHRocm93IG5ldyBUeXBlRXJyb3IoJ1Vua25vd24gZW5jb2Rpbmc6ICcgKyBlbmNvZGluZylcbiAgICAgICAgZW5jb2RpbmcgPSAoJycgKyBlbmNvZGluZykudG9Mb3dlckNhc2UoKVxuICAgICAgICBsb3dlcmVkQ2FzZSA9IHRydWVcbiAgICB9XG4gIH1cbn1cblxuQnVmZmVyLnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbiB0b0pTT04gKCkge1xuICByZXR1cm4ge1xuICAgIHR5cGU6ICdCdWZmZXInLFxuICAgIGRhdGE6IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKHRoaXMuX2FyciB8fCB0aGlzLCAwKVxuICB9XG59XG5cbmZ1bmN0aW9uIGJhc2U2NFNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgaWYgKHN0YXJ0ID09PSAwICYmIGVuZCA9PT0gYnVmLmxlbmd0aCkge1xuICAgIHJldHVybiBiYXNlNjQuZnJvbUJ5dGVBcnJheShidWYpXG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIGJhc2U2NC5mcm9tQnl0ZUFycmF5KGJ1Zi5zbGljZShzdGFydCwgZW5kKSlcbiAgfVxufVxuXG5mdW5jdGlvbiB1dGY4U2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICBlbmQgPSBNYXRoLm1pbihidWYubGVuZ3RoLCBlbmQpXG4gIHZhciByZXMgPSBbXVxuXG4gIHZhciBpID0gc3RhcnRcbiAgd2hpbGUgKGkgPCBlbmQpIHtcbiAgICB2YXIgZmlyc3RCeXRlID0gYnVmW2ldXG4gICAgdmFyIGNvZGVQb2ludCA9IG51bGxcbiAgICB2YXIgYnl0ZXNQZXJTZXF1ZW5jZSA9IChmaXJzdEJ5dGUgPiAweEVGKSA/IDRcbiAgICAgIDogKGZpcnN0Qnl0ZSA+IDB4REYpID8gM1xuICAgICAgOiAoZmlyc3RCeXRlID4gMHhCRikgPyAyXG4gICAgICA6IDFcblxuICAgIGlmIChpICsgYnl0ZXNQZXJTZXF1ZW5jZSA8PSBlbmQpIHtcbiAgICAgIHZhciBzZWNvbmRCeXRlLCB0aGlyZEJ5dGUsIGZvdXJ0aEJ5dGUsIHRlbXBDb2RlUG9pbnRcblxuICAgICAgc3dpdGNoIChieXRlc1BlclNlcXVlbmNlKSB7XG4gICAgICAgIGNhc2UgMTpcbiAgICAgICAgICBpZiAoZmlyc3RCeXRlIDwgMHg4MCkge1xuICAgICAgICAgICAgY29kZVBvaW50ID0gZmlyc3RCeXRlXG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIGNhc2UgMjpcbiAgICAgICAgICBzZWNvbmRCeXRlID0gYnVmW2kgKyAxXVxuICAgICAgICAgIGlmICgoc2Vjb25kQnl0ZSAmIDB4QzApID09PSAweDgwKSB7XG4gICAgICAgICAgICB0ZW1wQ29kZVBvaW50ID0gKGZpcnN0Qnl0ZSAmIDB4MUYpIDw8IDB4NiB8IChzZWNvbmRCeXRlICYgMHgzRilcbiAgICAgICAgICAgIGlmICh0ZW1wQ29kZVBvaW50ID4gMHg3Rikge1xuICAgICAgICAgICAgICBjb2RlUG9pbnQgPSB0ZW1wQ29kZVBvaW50XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIGNhc2UgMzpcbiAgICAgICAgICBzZWNvbmRCeXRlID0gYnVmW2kgKyAxXVxuICAgICAgICAgIHRoaXJkQnl0ZSA9IGJ1ZltpICsgMl1cbiAgICAgICAgICBpZiAoKHNlY29uZEJ5dGUgJiAweEMwKSA9PT0gMHg4MCAmJiAodGhpcmRCeXRlICYgMHhDMCkgPT09IDB4ODApIHtcbiAgICAgICAgICAgIHRlbXBDb2RlUG9pbnQgPSAoZmlyc3RCeXRlICYgMHhGKSA8PCAweEMgfCAoc2Vjb25kQnl0ZSAmIDB4M0YpIDw8IDB4NiB8ICh0aGlyZEJ5dGUgJiAweDNGKVxuICAgICAgICAgICAgaWYgKHRlbXBDb2RlUG9pbnQgPiAweDdGRiAmJiAodGVtcENvZGVQb2ludCA8IDB4RDgwMCB8fCB0ZW1wQ29kZVBvaW50ID4gMHhERkZGKSkge1xuICAgICAgICAgICAgICBjb2RlUG9pbnQgPSB0ZW1wQ29kZVBvaW50XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIGNhc2UgNDpcbiAgICAgICAgICBzZWNvbmRCeXRlID0gYnVmW2kgKyAxXVxuICAgICAgICAgIHRoaXJkQnl0ZSA9IGJ1ZltpICsgMl1cbiAgICAgICAgICBmb3VydGhCeXRlID0gYnVmW2kgKyAzXVxuICAgICAgICAgIGlmICgoc2Vjb25kQnl0ZSAmIDB4QzApID09PSAweDgwICYmICh0aGlyZEJ5dGUgJiAweEMwKSA9PT0gMHg4MCAmJiAoZm91cnRoQnl0ZSAmIDB4QzApID09PSAweDgwKSB7XG4gICAgICAgICAgICB0ZW1wQ29kZVBvaW50ID0gKGZpcnN0Qnl0ZSAmIDB4RikgPDwgMHgxMiB8IChzZWNvbmRCeXRlICYgMHgzRikgPDwgMHhDIHwgKHRoaXJkQnl0ZSAmIDB4M0YpIDw8IDB4NiB8IChmb3VydGhCeXRlICYgMHgzRilcbiAgICAgICAgICAgIGlmICh0ZW1wQ29kZVBvaW50ID4gMHhGRkZGICYmIHRlbXBDb2RlUG9pbnQgPCAweDExMDAwMCkge1xuICAgICAgICAgICAgICBjb2RlUG9pbnQgPSB0ZW1wQ29kZVBvaW50XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChjb2RlUG9pbnQgPT09IG51bGwpIHtcbiAgICAgIC8vIHdlIGRpZCBub3QgZ2VuZXJhdGUgYSB2YWxpZCBjb2RlUG9pbnQgc28gaW5zZXJ0IGFcbiAgICAgIC8vIHJlcGxhY2VtZW50IGNoYXIgKFUrRkZGRCkgYW5kIGFkdmFuY2Ugb25seSAxIGJ5dGVcbiAgICAgIGNvZGVQb2ludCA9IDB4RkZGRFxuICAgICAgYnl0ZXNQZXJTZXF1ZW5jZSA9IDFcbiAgICB9IGVsc2UgaWYgKGNvZGVQb2ludCA+IDB4RkZGRikge1xuICAgICAgLy8gZW5jb2RlIHRvIHV0ZjE2IChzdXJyb2dhdGUgcGFpciBkYW5jZSlcbiAgICAgIGNvZGVQb2ludCAtPSAweDEwMDAwXG4gICAgICByZXMucHVzaChjb2RlUG9pbnQgPj4+IDEwICYgMHgzRkYgfCAweEQ4MDApXG4gICAgICBjb2RlUG9pbnQgPSAweERDMDAgfCBjb2RlUG9pbnQgJiAweDNGRlxuICAgIH1cblxuICAgIHJlcy5wdXNoKGNvZGVQb2ludClcbiAgICBpICs9IGJ5dGVzUGVyU2VxdWVuY2VcbiAgfVxuXG4gIHJldHVybiBkZWNvZGVDb2RlUG9pbnRzQXJyYXkocmVzKVxufVxuXG4vLyBCYXNlZCBvbiBodHRwOi8vc3RhY2tvdmVyZmxvdy5jb20vYS8yMjc0NzI3Mi82ODA3NDIsIHRoZSBicm93c2VyIHdpdGhcbi8vIHRoZSBsb3dlc3QgbGltaXQgaXMgQ2hyb21lLCB3aXRoIDB4MTAwMDAgYXJncy5cbi8vIFdlIGdvIDEgbWFnbml0dWRlIGxlc3MsIGZvciBzYWZldHlcbnZhciBNQVhfQVJHVU1FTlRTX0xFTkdUSCA9IDB4MTAwMFxuXG5mdW5jdGlvbiBkZWNvZGVDb2RlUG9pbnRzQXJyYXkgKGNvZGVQb2ludHMpIHtcbiAgdmFyIGxlbiA9IGNvZGVQb2ludHMubGVuZ3RoXG4gIGlmIChsZW4gPD0gTUFYX0FSR1VNRU5UU19MRU5HVEgpIHtcbiAgICByZXR1cm4gU3RyaW5nLmZyb21DaGFyQ29kZS5hcHBseShTdHJpbmcsIGNvZGVQb2ludHMpIC8vIGF2b2lkIGV4dHJhIHNsaWNlKClcbiAgfVxuXG4gIC8vIERlY29kZSBpbiBjaHVua3MgdG8gYXZvaWQgXCJjYWxsIHN0YWNrIHNpemUgZXhjZWVkZWRcIi5cbiAgdmFyIHJlcyA9ICcnXG4gIHZhciBpID0gMFxuICB3aGlsZSAoaSA8IGxlbikge1xuICAgIHJlcyArPSBTdHJpbmcuZnJvbUNoYXJDb2RlLmFwcGx5KFxuICAgICAgU3RyaW5nLFxuICAgICAgY29kZVBvaW50cy5zbGljZShpLCBpICs9IE1BWF9BUkdVTUVOVFNfTEVOR1RIKVxuICAgIClcbiAgfVxuICByZXR1cm4gcmVzXG59XG5cbmZ1bmN0aW9uIGFzY2lpU2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICB2YXIgcmV0ID0gJydcbiAgZW5kID0gTWF0aC5taW4oYnVmLmxlbmd0aCwgZW5kKVxuXG4gIGZvciAodmFyIGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKSB7XG4gICAgcmV0ICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoYnVmW2ldICYgMHg3RilcbiAgfVxuICByZXR1cm4gcmV0XG59XG5cbmZ1bmN0aW9uIGJpbmFyeVNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIHJldCA9ICcnXG4gIGVuZCA9IE1hdGgubWluKGJ1Zi5sZW5ndGgsIGVuZClcblxuICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPCBlbmQ7IGkrKykge1xuICAgIHJldCArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGJ1ZltpXSlcbiAgfVxuICByZXR1cm4gcmV0XG59XG5cbmZ1bmN0aW9uIGhleFNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcblxuICBpZiAoIXN0YXJ0IHx8IHN0YXJ0IDwgMCkgc3RhcnQgPSAwXG4gIGlmICghZW5kIHx8IGVuZCA8IDAgfHwgZW5kID4gbGVuKSBlbmQgPSBsZW5cblxuICB2YXIgb3V0ID0gJydcbiAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspIHtcbiAgICBvdXQgKz0gdG9IZXgoYnVmW2ldKVxuICB9XG4gIHJldHVybiBvdXRcbn1cblxuZnVuY3Rpb24gdXRmMTZsZVNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIGJ5dGVzID0gYnVmLnNsaWNlKHN0YXJ0LCBlbmQpXG4gIHZhciByZXMgPSAnJ1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGJ5dGVzLmxlbmd0aDsgaSArPSAyKSB7XG4gICAgcmVzICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoYnl0ZXNbaV0gKyBieXRlc1tpICsgMV0gKiAyNTYpXG4gIH1cbiAgcmV0dXJuIHJlc1xufVxuXG5CdWZmZXIucHJvdG90eXBlLnNsaWNlID0gZnVuY3Rpb24gc2xpY2UgKHN0YXJ0LCBlbmQpIHtcbiAgdmFyIGxlbiA9IHRoaXMubGVuZ3RoXG4gIHN0YXJ0ID0gfn5zdGFydFxuICBlbmQgPSBlbmQgPT09IHVuZGVmaW5lZCA/IGxlbiA6IH5+ZW5kXG5cbiAgaWYgKHN0YXJ0IDwgMCkge1xuICAgIHN0YXJ0ICs9IGxlblxuICAgIGlmIChzdGFydCA8IDApIHN0YXJ0ID0gMFxuICB9IGVsc2UgaWYgKHN0YXJ0ID4gbGVuKSB7XG4gICAgc3RhcnQgPSBsZW5cbiAgfVxuXG4gIGlmIChlbmQgPCAwKSB7XG4gICAgZW5kICs9IGxlblxuICAgIGlmIChlbmQgPCAwKSBlbmQgPSAwXG4gIH0gZWxzZSBpZiAoZW5kID4gbGVuKSB7XG4gICAgZW5kID0gbGVuXG4gIH1cblxuICBpZiAoZW5kIDwgc3RhcnQpIGVuZCA9IHN0YXJ0XG5cbiAgdmFyIG5ld0J1ZlxuICBpZiAoQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHtcbiAgICBuZXdCdWYgPSBCdWZmZXIuX2F1Z21lbnQodGhpcy5zdWJhcnJheShzdGFydCwgZW5kKSlcbiAgfSBlbHNlIHtcbiAgICB2YXIgc2xpY2VMZW4gPSBlbmQgLSBzdGFydFxuICAgIG5ld0J1ZiA9IG5ldyBCdWZmZXIoc2xpY2VMZW4sIHVuZGVmaW5lZClcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHNsaWNlTGVuOyBpKyspIHtcbiAgICAgIG5ld0J1ZltpXSA9IHRoaXNbaSArIHN0YXJ0XVxuICAgIH1cbiAgfVxuXG4gIGlmIChuZXdCdWYubGVuZ3RoKSBuZXdCdWYucGFyZW50ID0gdGhpcy5wYXJlbnQgfHwgdGhpc1xuXG4gIHJldHVybiBuZXdCdWZcbn1cblxuLypcbiAqIE5lZWQgdG8gbWFrZSBzdXJlIHRoYXQgYnVmZmVyIGlzbid0IHRyeWluZyB0byB3cml0ZSBvdXQgb2YgYm91bmRzLlxuICovXG5mdW5jdGlvbiBjaGVja09mZnNldCAob2Zmc2V0LCBleHQsIGxlbmd0aCkge1xuICBpZiAoKG9mZnNldCAlIDEpICE9PSAwIHx8IG9mZnNldCA8IDApIHRocm93IG5ldyBSYW5nZUVycm9yKCdvZmZzZXQgaXMgbm90IHVpbnQnKVxuICBpZiAob2Zmc2V0ICsgZXh0ID4gbGVuZ3RoKSB0aHJvdyBuZXcgUmFuZ2VFcnJvcignVHJ5aW5nIHRvIGFjY2VzcyBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnRMRSA9IGZ1bmN0aW9uIHJlYWRVSW50TEUgKG9mZnNldCwgYnl0ZUxlbmd0aCwgbm9Bc3NlcnQpIHtcbiAgb2Zmc2V0ID0gb2Zmc2V0IHwgMFxuICBieXRlTGVuZ3RoID0gYnl0ZUxlbmd0aCB8IDBcbiAgaWYgKCFub0Fzc2VydCkgY2hlY2tPZmZzZXQob2Zmc2V0LCBieXRlTGVuZ3RoLCB0aGlzLmxlbmd0aClcblxuICB2YXIgdmFsID0gdGhpc1tvZmZzZXRdXG4gIHZhciBtdWwgPSAxXG4gIHZhciBpID0gMFxuICB3aGlsZSAoKytpIDwgYnl0ZUxlbmd0aCAmJiAobXVsICo9IDB4MTAwKSkge1xuICAgIHZhbCArPSB0aGlzW29mZnNldCArIGldICogbXVsXG4gIH1cblxuICByZXR1cm4gdmFsXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnRCRSA9IGZ1bmN0aW9uIHJlYWRVSW50QkUgKG9mZnNldCwgYnl0ZUxlbmd0aCwgbm9Bc3NlcnQpIHtcbiAgb2Zmc2V0ID0gb2Zmc2V0IHwgMFxuICBieXRlTGVuZ3RoID0gYnl0ZUxlbmd0aCB8IDBcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGNoZWNrT2Zmc2V0KG9mZnNldCwgYnl0ZUxlbmd0aCwgdGhpcy5sZW5ndGgpXG4gIH1cblxuICB2YXIgdmFsID0gdGhpc1tvZmZzZXQgKyAtLWJ5dGVMZW5ndGhdXG4gIHZhciBtdWwgPSAxXG4gIHdoaWxlIChieXRlTGVuZ3RoID4gMCAmJiAobXVsICo9IDB4MTAwKSkge1xuICAgIHZhbCArPSB0aGlzW29mZnNldCArIC0tYnl0ZUxlbmd0aF0gKiBtdWxcbiAgfVxuXG4gIHJldHVybiB2YWxcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDggPSBmdW5jdGlvbiByZWFkVUludDggKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkgY2hlY2tPZmZzZXQob2Zmc2V0LCAxLCB0aGlzLmxlbmd0aClcbiAgcmV0dXJuIHRoaXNbb2Zmc2V0XVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50MTZMRSA9IGZ1bmN0aW9uIHJlYWRVSW50MTZMRSAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSBjaGVja09mZnNldChvZmZzZXQsIDIsIHRoaXMubGVuZ3RoKVxuICByZXR1cm4gdGhpc1tvZmZzZXRdIHwgKHRoaXNbb2Zmc2V0ICsgMV0gPDwgOClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDE2QkUgPSBmdW5jdGlvbiByZWFkVUludDE2QkUgKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkgY2hlY2tPZmZzZXQob2Zmc2V0LCAyLCB0aGlzLmxlbmd0aClcbiAgcmV0dXJuICh0aGlzW29mZnNldF0gPDwgOCkgfCB0aGlzW29mZnNldCArIDFdXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnQzMkxFID0gZnVuY3Rpb24gcmVhZFVJbnQzMkxFIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIGNoZWNrT2Zmc2V0KG9mZnNldCwgNCwgdGhpcy5sZW5ndGgpXG5cbiAgcmV0dXJuICgodGhpc1tvZmZzZXRdKSB8XG4gICAgICAodGhpc1tvZmZzZXQgKyAxXSA8PCA4KSB8XG4gICAgICAodGhpc1tvZmZzZXQgKyAyXSA8PCAxNikpICtcbiAgICAgICh0aGlzW29mZnNldCArIDNdICogMHgxMDAwMDAwKVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50MzJCRSA9IGZ1bmN0aW9uIHJlYWRVSW50MzJCRSAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSBjaGVja09mZnNldChvZmZzZXQsIDQsIHRoaXMubGVuZ3RoKVxuXG4gIHJldHVybiAodGhpc1tvZmZzZXRdICogMHgxMDAwMDAwKSArXG4gICAgKCh0aGlzW29mZnNldCArIDFdIDw8IDE2KSB8XG4gICAgKHRoaXNbb2Zmc2V0ICsgMl0gPDwgOCkgfFxuICAgIHRoaXNbb2Zmc2V0ICsgM10pXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludExFID0gZnVuY3Rpb24gcmVhZEludExFIChvZmZzZXQsIGJ5dGVMZW5ndGgsIG5vQXNzZXJ0KSB7XG4gIG9mZnNldCA9IG9mZnNldCB8IDBcbiAgYnl0ZUxlbmd0aCA9IGJ5dGVMZW5ndGggfCAwXG4gIGlmICghbm9Bc3NlcnQpIGNoZWNrT2Zmc2V0KG9mZnNldCwgYnl0ZUxlbmd0aCwgdGhpcy5sZW5ndGgpXG5cbiAgdmFyIHZhbCA9IHRoaXNbb2Zmc2V0XVxuICB2YXIgbXVsID0gMVxuICB2YXIgaSA9IDBcbiAgd2hpbGUgKCsraSA8IGJ5dGVMZW5ndGggJiYgKG11bCAqPSAweDEwMCkpIHtcbiAgICB2YWwgKz0gdGhpc1tvZmZzZXQgKyBpXSAqIG11bFxuICB9XG4gIG11bCAqPSAweDgwXG5cbiAgaWYgKHZhbCA+PSBtdWwpIHZhbCAtPSBNYXRoLnBvdygyLCA4ICogYnl0ZUxlbmd0aClcblxuICByZXR1cm4gdmFsXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludEJFID0gZnVuY3Rpb24gcmVhZEludEJFIChvZmZzZXQsIGJ5dGVMZW5ndGgsIG5vQXNzZXJ0KSB7XG4gIG9mZnNldCA9IG9mZnNldCB8IDBcbiAgYnl0ZUxlbmd0aCA9IGJ5dGVMZW5ndGggfCAwXG4gIGlmICghbm9Bc3NlcnQpIGNoZWNrT2Zmc2V0KG9mZnNldCwgYnl0ZUxlbmd0aCwgdGhpcy5sZW5ndGgpXG5cbiAgdmFyIGkgPSBieXRlTGVuZ3RoXG4gIHZhciBtdWwgPSAxXG4gIHZhciB2YWwgPSB0aGlzW29mZnNldCArIC0taV1cbiAgd2hpbGUgKGkgPiAwICYmIChtdWwgKj0gMHgxMDApKSB7XG4gICAgdmFsICs9IHRoaXNbb2Zmc2V0ICsgLS1pXSAqIG11bFxuICB9XG4gIG11bCAqPSAweDgwXG5cbiAgaWYgKHZhbCA+PSBtdWwpIHZhbCAtPSBNYXRoLnBvdygyLCA4ICogYnl0ZUxlbmd0aClcblxuICByZXR1cm4gdmFsXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDggPSBmdW5jdGlvbiByZWFkSW50OCAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSBjaGVja09mZnNldChvZmZzZXQsIDEsIHRoaXMubGVuZ3RoKVxuICBpZiAoISh0aGlzW29mZnNldF0gJiAweDgwKSkgcmV0dXJuICh0aGlzW29mZnNldF0pXG4gIHJldHVybiAoKDB4ZmYgLSB0aGlzW29mZnNldF0gKyAxKSAqIC0xKVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRJbnQxNkxFID0gZnVuY3Rpb24gcmVhZEludDE2TEUgKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkgY2hlY2tPZmZzZXQob2Zmc2V0LCAyLCB0aGlzLmxlbmd0aClcbiAgdmFyIHZhbCA9IHRoaXNbb2Zmc2V0XSB8ICh0aGlzW29mZnNldCArIDFdIDw8IDgpXG4gIHJldHVybiAodmFsICYgMHg4MDAwKSA/IHZhbCB8IDB4RkZGRjAwMDAgOiB2YWxcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50MTZCRSA9IGZ1bmN0aW9uIHJlYWRJbnQxNkJFIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIGNoZWNrT2Zmc2V0KG9mZnNldCwgMiwgdGhpcy5sZW5ndGgpXG4gIHZhciB2YWwgPSB0aGlzW29mZnNldCArIDFdIHwgKHRoaXNbb2Zmc2V0XSA8PCA4KVxuICByZXR1cm4gKHZhbCAmIDB4ODAwMCkgPyB2YWwgfCAweEZGRkYwMDAwIDogdmFsXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDMyTEUgPSBmdW5jdGlvbiByZWFkSW50MzJMRSAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSBjaGVja09mZnNldChvZmZzZXQsIDQsIHRoaXMubGVuZ3RoKVxuXG4gIHJldHVybiAodGhpc1tvZmZzZXRdKSB8XG4gICAgKHRoaXNbb2Zmc2V0ICsgMV0gPDwgOCkgfFxuICAgICh0aGlzW29mZnNldCArIDJdIDw8IDE2KSB8XG4gICAgKHRoaXNbb2Zmc2V0ICsgM10gPDwgMjQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDMyQkUgPSBmdW5jdGlvbiByZWFkSW50MzJCRSAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSBjaGVja09mZnNldChvZmZzZXQsIDQsIHRoaXMubGVuZ3RoKVxuXG4gIHJldHVybiAodGhpc1tvZmZzZXRdIDw8IDI0KSB8XG4gICAgKHRoaXNbb2Zmc2V0ICsgMV0gPDwgMTYpIHxcbiAgICAodGhpc1tvZmZzZXQgKyAyXSA8PCA4KSB8XG4gICAgKHRoaXNbb2Zmc2V0ICsgM10pXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEZsb2F0TEUgPSBmdW5jdGlvbiByZWFkRmxvYXRMRSAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSBjaGVja09mZnNldChvZmZzZXQsIDQsIHRoaXMubGVuZ3RoKVxuICByZXR1cm4gaWVlZTc1NC5yZWFkKHRoaXMsIG9mZnNldCwgdHJ1ZSwgMjMsIDQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEZsb2F0QkUgPSBmdW5jdGlvbiByZWFkRmxvYXRCRSAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSBjaGVja09mZnNldChvZmZzZXQsIDQsIHRoaXMubGVuZ3RoKVxuICByZXR1cm4gaWVlZTc1NC5yZWFkKHRoaXMsIG9mZnNldCwgZmFsc2UsIDIzLCA0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWREb3VibGVMRSA9IGZ1bmN0aW9uIHJlYWREb3VibGVMRSAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSBjaGVja09mZnNldChvZmZzZXQsIDgsIHRoaXMubGVuZ3RoKVxuICByZXR1cm4gaWVlZTc1NC5yZWFkKHRoaXMsIG9mZnNldCwgdHJ1ZSwgNTIsIDgpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZERvdWJsZUJFID0gZnVuY3Rpb24gcmVhZERvdWJsZUJFIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIGNoZWNrT2Zmc2V0KG9mZnNldCwgOCwgdGhpcy5sZW5ndGgpXG4gIHJldHVybiBpZWVlNzU0LnJlYWQodGhpcywgb2Zmc2V0LCBmYWxzZSwgNTIsIDgpXG59XG5cbmZ1bmN0aW9uIGNoZWNrSW50IChidWYsIHZhbHVlLCBvZmZzZXQsIGV4dCwgbWF4LCBtaW4pIHtcbiAgaWYgKCFCdWZmZXIuaXNCdWZmZXIoYnVmKSkgdGhyb3cgbmV3IFR5cGVFcnJvcignYnVmZmVyIG11c3QgYmUgYSBCdWZmZXIgaW5zdGFuY2UnKVxuICBpZiAodmFsdWUgPiBtYXggfHwgdmFsdWUgPCBtaW4pIHRocm93IG5ldyBSYW5nZUVycm9yKCd2YWx1ZSBpcyBvdXQgb2YgYm91bmRzJylcbiAgaWYgKG9mZnNldCArIGV4dCA+IGJ1Zi5sZW5ndGgpIHRocm93IG5ldyBSYW5nZUVycm9yKCdpbmRleCBvdXQgb2YgcmFuZ2UnKVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludExFID0gZnVuY3Rpb24gd3JpdGVVSW50TEUgKHZhbHVlLCBvZmZzZXQsIGJ5dGVMZW5ndGgsIG5vQXNzZXJ0KSB7XG4gIHZhbHVlID0gK3ZhbHVlXG4gIG9mZnNldCA9IG9mZnNldCB8IDBcbiAgYnl0ZUxlbmd0aCA9IGJ5dGVMZW5ndGggfCAwXG4gIGlmICghbm9Bc3NlcnQpIGNoZWNrSW50KHRoaXMsIHZhbHVlLCBvZmZzZXQsIGJ5dGVMZW5ndGgsIE1hdGgucG93KDIsIDggKiBieXRlTGVuZ3RoKSwgMClcblxuICB2YXIgbXVsID0gMVxuICB2YXIgaSA9IDBcbiAgdGhpc1tvZmZzZXRdID0gdmFsdWUgJiAweEZGXG4gIHdoaWxlICgrK2kgPCBieXRlTGVuZ3RoICYmIChtdWwgKj0gMHgxMDApKSB7XG4gICAgdGhpc1tvZmZzZXQgKyBpXSA9ICh2YWx1ZSAvIG11bCkgJiAweEZGXG4gIH1cblxuICByZXR1cm4gb2Zmc2V0ICsgYnl0ZUxlbmd0aFxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludEJFID0gZnVuY3Rpb24gd3JpdGVVSW50QkUgKHZhbHVlLCBvZmZzZXQsIGJ5dGVMZW5ndGgsIG5vQXNzZXJ0KSB7XG4gIHZhbHVlID0gK3ZhbHVlXG4gIG9mZnNldCA9IG9mZnNldCB8IDBcbiAgYnl0ZUxlbmd0aCA9IGJ5dGVMZW5ndGggfCAwXG4gIGlmICghbm9Bc3NlcnQpIGNoZWNrSW50KHRoaXMsIHZhbHVlLCBvZmZzZXQsIGJ5dGVMZW5ndGgsIE1hdGgucG93KDIsIDggKiBieXRlTGVuZ3RoKSwgMClcblxuICB2YXIgaSA9IGJ5dGVMZW5ndGggLSAxXG4gIHZhciBtdWwgPSAxXG4gIHRoaXNbb2Zmc2V0ICsgaV0gPSB2YWx1ZSAmIDB4RkZcbiAgd2hpbGUgKC0taSA+PSAwICYmIChtdWwgKj0gMHgxMDApKSB7XG4gICAgdGhpc1tvZmZzZXQgKyBpXSA9ICh2YWx1ZSAvIG11bCkgJiAweEZGXG4gIH1cblxuICByZXR1cm4gb2Zmc2V0ICsgYnl0ZUxlbmd0aFxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludDggPSBmdW5jdGlvbiB3cml0ZVVJbnQ4ICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICB2YWx1ZSA9ICt2YWx1ZVxuICBvZmZzZXQgPSBvZmZzZXQgfCAwXG4gIGlmICghbm9Bc3NlcnQpIGNoZWNrSW50KHRoaXMsIHZhbHVlLCBvZmZzZXQsIDEsIDB4ZmYsIDApXG4gIGlmICghQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHZhbHVlID0gTWF0aC5mbG9vcih2YWx1ZSlcbiAgdGhpc1tvZmZzZXRdID0gKHZhbHVlICYgMHhmZilcbiAgcmV0dXJuIG9mZnNldCArIDFcbn1cblxuZnVuY3Rpb24gb2JqZWN0V3JpdGVVSW50MTYgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuKSB7XG4gIGlmICh2YWx1ZSA8IDApIHZhbHVlID0gMHhmZmZmICsgdmFsdWUgKyAxXG4gIGZvciAodmFyIGkgPSAwLCBqID0gTWF0aC5taW4oYnVmLmxlbmd0aCAtIG9mZnNldCwgMik7IGkgPCBqOyBpKyspIHtcbiAgICBidWZbb2Zmc2V0ICsgaV0gPSAodmFsdWUgJiAoMHhmZiA8PCAoOCAqIChsaXR0bGVFbmRpYW4gPyBpIDogMSAtIGkpKSkpID4+PlxuICAgICAgKGxpdHRsZUVuZGlhbiA/IGkgOiAxIC0gaSkgKiA4XG4gIH1cbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQxNkxFID0gZnVuY3Rpb24gd3JpdGVVSW50MTZMRSAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgdmFsdWUgPSArdmFsdWVcbiAgb2Zmc2V0ID0gb2Zmc2V0IHwgMFxuICBpZiAoIW5vQXNzZXJ0KSBjaGVja0ludCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCAyLCAweGZmZmYsIDApXG4gIGlmIChCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkge1xuICAgIHRoaXNbb2Zmc2V0XSA9ICh2YWx1ZSAmIDB4ZmYpXG4gICAgdGhpc1tvZmZzZXQgKyAxXSA9ICh2YWx1ZSA+Pj4gOClcbiAgfSBlbHNlIHtcbiAgICBvYmplY3RXcml0ZVVJbnQxNih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlKVxuICB9XG4gIHJldHVybiBvZmZzZXQgKyAyXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50MTZCRSA9IGZ1bmN0aW9uIHdyaXRlVUludDE2QkUgKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHZhbHVlID0gK3ZhbHVlXG4gIG9mZnNldCA9IG9mZnNldCB8IDBcbiAgaWYgKCFub0Fzc2VydCkgY2hlY2tJbnQodGhpcywgdmFsdWUsIG9mZnNldCwgMiwgMHhmZmZmLCAwKVxuICBpZiAoQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHtcbiAgICB0aGlzW29mZnNldF0gPSAodmFsdWUgPj4+IDgpXG4gICAgdGhpc1tvZmZzZXQgKyAxXSA9ICh2YWx1ZSAmIDB4ZmYpXG4gIH0gZWxzZSB7XG4gICAgb2JqZWN0V3JpdGVVSW50MTYodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UpXG4gIH1cbiAgcmV0dXJuIG9mZnNldCArIDJcbn1cblxuZnVuY3Rpb24gb2JqZWN0V3JpdGVVSW50MzIgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuKSB7XG4gIGlmICh2YWx1ZSA8IDApIHZhbHVlID0gMHhmZmZmZmZmZiArIHZhbHVlICsgMVxuICBmb3IgKHZhciBpID0gMCwgaiA9IE1hdGgubWluKGJ1Zi5sZW5ndGggLSBvZmZzZXQsIDQpOyBpIDwgajsgaSsrKSB7XG4gICAgYnVmW29mZnNldCArIGldID0gKHZhbHVlID4+PiAobGl0dGxlRW5kaWFuID8gaSA6IDMgLSBpKSAqIDgpICYgMHhmZlxuICB9XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50MzJMRSA9IGZ1bmN0aW9uIHdyaXRlVUludDMyTEUgKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHZhbHVlID0gK3ZhbHVlXG4gIG9mZnNldCA9IG9mZnNldCB8IDBcbiAgaWYgKCFub0Fzc2VydCkgY2hlY2tJbnQodGhpcywgdmFsdWUsIG9mZnNldCwgNCwgMHhmZmZmZmZmZiwgMClcbiAgaWYgKEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUKSB7XG4gICAgdGhpc1tvZmZzZXQgKyAzXSA9ICh2YWx1ZSA+Pj4gMjQpXG4gICAgdGhpc1tvZmZzZXQgKyAyXSA9ICh2YWx1ZSA+Pj4gMTYpXG4gICAgdGhpc1tvZmZzZXQgKyAxXSA9ICh2YWx1ZSA+Pj4gOClcbiAgICB0aGlzW29mZnNldF0gPSAodmFsdWUgJiAweGZmKVxuICB9IGVsc2Uge1xuICAgIG9iamVjdFdyaXRlVUludDMyKHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUpXG4gIH1cbiAgcmV0dXJuIG9mZnNldCArIDRcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQzMkJFID0gZnVuY3Rpb24gd3JpdGVVSW50MzJCRSAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgdmFsdWUgPSArdmFsdWVcbiAgb2Zmc2V0ID0gb2Zmc2V0IHwgMFxuICBpZiAoIW5vQXNzZXJ0KSBjaGVja0ludCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCA0LCAweGZmZmZmZmZmLCAwKVxuICBpZiAoQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHtcbiAgICB0aGlzW29mZnNldF0gPSAodmFsdWUgPj4+IDI0KVxuICAgIHRoaXNbb2Zmc2V0ICsgMV0gPSAodmFsdWUgPj4+IDE2KVxuICAgIHRoaXNbb2Zmc2V0ICsgMl0gPSAodmFsdWUgPj4+IDgpXG4gICAgdGhpc1tvZmZzZXQgKyAzXSA9ICh2YWx1ZSAmIDB4ZmYpXG4gIH0gZWxzZSB7XG4gICAgb2JqZWN0V3JpdGVVSW50MzIodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UpXG4gIH1cbiAgcmV0dXJuIG9mZnNldCArIDRcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludExFID0gZnVuY3Rpb24gd3JpdGVJbnRMRSAodmFsdWUsIG9mZnNldCwgYnl0ZUxlbmd0aCwgbm9Bc3NlcnQpIHtcbiAgdmFsdWUgPSArdmFsdWVcbiAgb2Zmc2V0ID0gb2Zmc2V0IHwgMFxuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgdmFyIGxpbWl0ID0gTWF0aC5wb3coMiwgOCAqIGJ5dGVMZW5ndGggLSAxKVxuXG4gICAgY2hlY2tJbnQodGhpcywgdmFsdWUsIG9mZnNldCwgYnl0ZUxlbmd0aCwgbGltaXQgLSAxLCAtbGltaXQpXG4gIH1cblxuICB2YXIgaSA9IDBcbiAgdmFyIG11bCA9IDFcbiAgdmFyIHN1YiA9IHZhbHVlIDwgMCA/IDEgOiAwXG4gIHRoaXNbb2Zmc2V0XSA9IHZhbHVlICYgMHhGRlxuICB3aGlsZSAoKytpIDwgYnl0ZUxlbmd0aCAmJiAobXVsICo9IDB4MTAwKSkge1xuICAgIHRoaXNbb2Zmc2V0ICsgaV0gPSAoKHZhbHVlIC8gbXVsKSA+PiAwKSAtIHN1YiAmIDB4RkZcbiAgfVxuXG4gIHJldHVybiBvZmZzZXQgKyBieXRlTGVuZ3RoXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVJbnRCRSA9IGZ1bmN0aW9uIHdyaXRlSW50QkUgKHZhbHVlLCBvZmZzZXQsIGJ5dGVMZW5ndGgsIG5vQXNzZXJ0KSB7XG4gIHZhbHVlID0gK3ZhbHVlXG4gIG9mZnNldCA9IG9mZnNldCB8IDBcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIHZhciBsaW1pdCA9IE1hdGgucG93KDIsIDggKiBieXRlTGVuZ3RoIC0gMSlcblxuICAgIGNoZWNrSW50KHRoaXMsIHZhbHVlLCBvZmZzZXQsIGJ5dGVMZW5ndGgsIGxpbWl0IC0gMSwgLWxpbWl0KVxuICB9XG5cbiAgdmFyIGkgPSBieXRlTGVuZ3RoIC0gMVxuICB2YXIgbXVsID0gMVxuICB2YXIgc3ViID0gdmFsdWUgPCAwID8gMSA6IDBcbiAgdGhpc1tvZmZzZXQgKyBpXSA9IHZhbHVlICYgMHhGRlxuICB3aGlsZSAoLS1pID49IDAgJiYgKG11bCAqPSAweDEwMCkpIHtcbiAgICB0aGlzW29mZnNldCArIGldID0gKCh2YWx1ZSAvIG11bCkgPj4gMCkgLSBzdWIgJiAweEZGXG4gIH1cblxuICByZXR1cm4gb2Zmc2V0ICsgYnl0ZUxlbmd0aFxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50OCA9IGZ1bmN0aW9uIHdyaXRlSW50OCAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgdmFsdWUgPSArdmFsdWVcbiAgb2Zmc2V0ID0gb2Zmc2V0IHwgMFxuICBpZiAoIW5vQXNzZXJ0KSBjaGVja0ludCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCAxLCAweDdmLCAtMHg4MClcbiAgaWYgKCFCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkgdmFsdWUgPSBNYXRoLmZsb29yKHZhbHVlKVxuICBpZiAodmFsdWUgPCAwKSB2YWx1ZSA9IDB4ZmYgKyB2YWx1ZSArIDFcbiAgdGhpc1tvZmZzZXRdID0gKHZhbHVlICYgMHhmZilcbiAgcmV0dXJuIG9mZnNldCArIDFcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDE2TEUgPSBmdW5jdGlvbiB3cml0ZUludDE2TEUgKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHZhbHVlID0gK3ZhbHVlXG4gIG9mZnNldCA9IG9mZnNldCB8IDBcbiAgaWYgKCFub0Fzc2VydCkgY2hlY2tJbnQodGhpcywgdmFsdWUsIG9mZnNldCwgMiwgMHg3ZmZmLCAtMHg4MDAwKVxuICBpZiAoQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHtcbiAgICB0aGlzW29mZnNldF0gPSAodmFsdWUgJiAweGZmKVxuICAgIHRoaXNbb2Zmc2V0ICsgMV0gPSAodmFsdWUgPj4+IDgpXG4gIH0gZWxzZSB7XG4gICAgb2JqZWN0V3JpdGVVSW50MTYodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSlcbiAgfVxuICByZXR1cm4gb2Zmc2V0ICsgMlxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50MTZCRSA9IGZ1bmN0aW9uIHdyaXRlSW50MTZCRSAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgdmFsdWUgPSArdmFsdWVcbiAgb2Zmc2V0ID0gb2Zmc2V0IHwgMFxuICBpZiAoIW5vQXNzZXJ0KSBjaGVja0ludCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCAyLCAweDdmZmYsIC0weDgwMDApXG4gIGlmIChCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkge1xuICAgIHRoaXNbb2Zmc2V0XSA9ICh2YWx1ZSA+Pj4gOClcbiAgICB0aGlzW29mZnNldCArIDFdID0gKHZhbHVlICYgMHhmZilcbiAgfSBlbHNlIHtcbiAgICBvYmplY3RXcml0ZVVJbnQxNih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSlcbiAgfVxuICByZXR1cm4gb2Zmc2V0ICsgMlxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50MzJMRSA9IGZ1bmN0aW9uIHdyaXRlSW50MzJMRSAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgdmFsdWUgPSArdmFsdWVcbiAgb2Zmc2V0ID0gb2Zmc2V0IHwgMFxuICBpZiAoIW5vQXNzZXJ0KSBjaGVja0ludCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCA0LCAweDdmZmZmZmZmLCAtMHg4MDAwMDAwMClcbiAgaWYgKEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUKSB7XG4gICAgdGhpc1tvZmZzZXRdID0gKHZhbHVlICYgMHhmZilcbiAgICB0aGlzW29mZnNldCArIDFdID0gKHZhbHVlID4+PiA4KVxuICAgIHRoaXNbb2Zmc2V0ICsgMl0gPSAodmFsdWUgPj4+IDE2KVxuICAgIHRoaXNbb2Zmc2V0ICsgM10gPSAodmFsdWUgPj4+IDI0KVxuICB9IGVsc2Uge1xuICAgIG9iamVjdFdyaXRlVUludDMyKHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUpXG4gIH1cbiAgcmV0dXJuIG9mZnNldCArIDRcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDMyQkUgPSBmdW5jdGlvbiB3cml0ZUludDMyQkUgKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHZhbHVlID0gK3ZhbHVlXG4gIG9mZnNldCA9IG9mZnNldCB8IDBcbiAgaWYgKCFub0Fzc2VydCkgY2hlY2tJbnQodGhpcywgdmFsdWUsIG9mZnNldCwgNCwgMHg3ZmZmZmZmZiwgLTB4ODAwMDAwMDApXG4gIGlmICh2YWx1ZSA8IDApIHZhbHVlID0gMHhmZmZmZmZmZiArIHZhbHVlICsgMVxuICBpZiAoQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHtcbiAgICB0aGlzW29mZnNldF0gPSAodmFsdWUgPj4+IDI0KVxuICAgIHRoaXNbb2Zmc2V0ICsgMV0gPSAodmFsdWUgPj4+IDE2KVxuICAgIHRoaXNbb2Zmc2V0ICsgMl0gPSAodmFsdWUgPj4+IDgpXG4gICAgdGhpc1tvZmZzZXQgKyAzXSA9ICh2YWx1ZSAmIDB4ZmYpXG4gIH0gZWxzZSB7XG4gICAgb2JqZWN0V3JpdGVVSW50MzIodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UpXG4gIH1cbiAgcmV0dXJuIG9mZnNldCArIDRcbn1cblxuZnVuY3Rpb24gY2hlY2tJRUVFNzU0IChidWYsIHZhbHVlLCBvZmZzZXQsIGV4dCwgbWF4LCBtaW4pIHtcbiAgaWYgKHZhbHVlID4gbWF4IHx8IHZhbHVlIDwgbWluKSB0aHJvdyBuZXcgUmFuZ2VFcnJvcigndmFsdWUgaXMgb3V0IG9mIGJvdW5kcycpXG4gIGlmIChvZmZzZXQgKyBleHQgPiBidWYubGVuZ3RoKSB0aHJvdyBuZXcgUmFuZ2VFcnJvcignaW5kZXggb3V0IG9mIHJhbmdlJylcbiAgaWYgKG9mZnNldCA8IDApIHRocm93IG5ldyBSYW5nZUVycm9yKCdpbmRleCBvdXQgb2YgcmFuZ2UnKVxufVxuXG5mdW5jdGlvbiB3cml0ZUZsb2F0IChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGNoZWNrSUVFRTc1NChidWYsIHZhbHVlLCBvZmZzZXQsIDQsIDMuNDAyODIzNDY2Mzg1Mjg4NmUrMzgsIC0zLjQwMjgyMzQ2NjM4NTI4ODZlKzM4KVxuICB9XG4gIGllZWU3NTQud3JpdGUoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIDIzLCA0KVxuICByZXR1cm4gb2Zmc2V0ICsgNFxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlRmxvYXRMRSA9IGZ1bmN0aW9uIHdyaXRlRmxvYXRMRSAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIHdyaXRlRmxvYXQodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVGbG9hdEJFID0gZnVuY3Rpb24gd3JpdGVGbG9hdEJFICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gd3JpdGVGbG9hdCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIHdyaXRlRG91YmxlIChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGNoZWNrSUVFRTc1NChidWYsIHZhbHVlLCBvZmZzZXQsIDgsIDEuNzk3NjkzMTM0ODYyMzE1N0UrMzA4LCAtMS43OTc2OTMxMzQ4NjIzMTU3RSszMDgpXG4gIH1cbiAgaWVlZTc1NC53cml0ZShidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgNTIsIDgpXG4gIHJldHVybiBvZmZzZXQgKyA4XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVEb3VibGVMRSA9IGZ1bmN0aW9uIHdyaXRlRG91YmxlTEUgKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiB3cml0ZURvdWJsZSh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZURvdWJsZUJFID0gZnVuY3Rpb24gd3JpdGVEb3VibGVCRSAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIHdyaXRlRG91YmxlKHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuLy8gY29weSh0YXJnZXRCdWZmZXIsIHRhcmdldFN0YXJ0PTAsIHNvdXJjZVN0YXJ0PTAsIHNvdXJjZUVuZD1idWZmZXIubGVuZ3RoKVxuQnVmZmVyLnByb3RvdHlwZS5jb3B5ID0gZnVuY3Rpb24gY29weSAodGFyZ2V0LCB0YXJnZXRTdGFydCwgc3RhcnQsIGVuZCkge1xuICBpZiAoIXN0YXJ0KSBzdGFydCA9IDBcbiAgaWYgKCFlbmQgJiYgZW5kICE9PSAwKSBlbmQgPSB0aGlzLmxlbmd0aFxuICBpZiAodGFyZ2V0U3RhcnQgPj0gdGFyZ2V0Lmxlbmd0aCkgdGFyZ2V0U3RhcnQgPSB0YXJnZXQubGVuZ3RoXG4gIGlmICghdGFyZ2V0U3RhcnQpIHRhcmdldFN0YXJ0ID0gMFxuICBpZiAoZW5kID4gMCAmJiBlbmQgPCBzdGFydCkgZW5kID0gc3RhcnRcblxuICAvLyBDb3B5IDAgYnl0ZXM7IHdlJ3JlIGRvbmVcbiAgaWYgKGVuZCA9PT0gc3RhcnQpIHJldHVybiAwXG4gIGlmICh0YXJnZXQubGVuZ3RoID09PSAwIHx8IHRoaXMubGVuZ3RoID09PSAwKSByZXR1cm4gMFxuXG4gIC8vIEZhdGFsIGVycm9yIGNvbmRpdGlvbnNcbiAgaWYgKHRhcmdldFN0YXJ0IDwgMCkge1xuICAgIHRocm93IG5ldyBSYW5nZUVycm9yKCd0YXJnZXRTdGFydCBvdXQgb2YgYm91bmRzJylcbiAgfVxuICBpZiAoc3RhcnQgPCAwIHx8IHN0YXJ0ID49IHRoaXMubGVuZ3RoKSB0aHJvdyBuZXcgUmFuZ2VFcnJvcignc291cmNlU3RhcnQgb3V0IG9mIGJvdW5kcycpXG4gIGlmIChlbmQgPCAwKSB0aHJvdyBuZXcgUmFuZ2VFcnJvcignc291cmNlRW5kIG91dCBvZiBib3VuZHMnKVxuXG4gIC8vIEFyZSB3ZSBvb2I/XG4gIGlmIChlbmQgPiB0aGlzLmxlbmd0aCkgZW5kID0gdGhpcy5sZW5ndGhcbiAgaWYgKHRhcmdldC5sZW5ndGggLSB0YXJnZXRTdGFydCA8IGVuZCAtIHN0YXJ0KSB7XG4gICAgZW5kID0gdGFyZ2V0Lmxlbmd0aCAtIHRhcmdldFN0YXJ0ICsgc3RhcnRcbiAgfVxuXG4gIHZhciBsZW4gPSBlbmQgLSBzdGFydFxuICB2YXIgaVxuXG4gIGlmICh0aGlzID09PSB0YXJnZXQgJiYgc3RhcnQgPCB0YXJnZXRTdGFydCAmJiB0YXJnZXRTdGFydCA8IGVuZCkge1xuICAgIC8vIGRlc2NlbmRpbmcgY29weSBmcm9tIGVuZFxuICAgIGZvciAoaSA9IGxlbiAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICB0YXJnZXRbaSArIHRhcmdldFN0YXJ0XSA9IHRoaXNbaSArIHN0YXJ0XVxuICAgIH1cbiAgfSBlbHNlIGlmIChsZW4gPCAxMDAwIHx8ICFCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkge1xuICAgIC8vIGFzY2VuZGluZyBjb3B5IGZyb20gc3RhcnRcbiAgICBmb3IgKGkgPSAwOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgIHRhcmdldFtpICsgdGFyZ2V0U3RhcnRdID0gdGhpc1tpICsgc3RhcnRdXG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHRhcmdldC5fc2V0KHRoaXMuc3ViYXJyYXkoc3RhcnQsIHN0YXJ0ICsgbGVuKSwgdGFyZ2V0U3RhcnQpXG4gIH1cblxuICByZXR1cm4gbGVuXG59XG5cbi8vIGZpbGwodmFsdWUsIHN0YXJ0PTAsIGVuZD1idWZmZXIubGVuZ3RoKVxuQnVmZmVyLnByb3RvdHlwZS5maWxsID0gZnVuY3Rpb24gZmlsbCAodmFsdWUsIHN0YXJ0LCBlbmQpIHtcbiAgaWYgKCF2YWx1ZSkgdmFsdWUgPSAwXG4gIGlmICghc3RhcnQpIHN0YXJ0ID0gMFxuICBpZiAoIWVuZCkgZW5kID0gdGhpcy5sZW5ndGhcblxuICBpZiAoZW5kIDwgc3RhcnQpIHRocm93IG5ldyBSYW5nZUVycm9yKCdlbmQgPCBzdGFydCcpXG5cbiAgLy8gRmlsbCAwIGJ5dGVzOyB3ZSdyZSBkb25lXG4gIGlmIChlbmQgPT09IHN0YXJ0KSByZXR1cm5cbiAgaWYgKHRoaXMubGVuZ3RoID09PSAwKSByZXR1cm5cblxuICBpZiAoc3RhcnQgPCAwIHx8IHN0YXJ0ID49IHRoaXMubGVuZ3RoKSB0aHJvdyBuZXcgUmFuZ2VFcnJvcignc3RhcnQgb3V0IG9mIGJvdW5kcycpXG4gIGlmIChlbmQgPCAwIHx8IGVuZCA+IHRoaXMubGVuZ3RoKSB0aHJvdyBuZXcgUmFuZ2VFcnJvcignZW5kIG91dCBvZiBib3VuZHMnKVxuXG4gIHZhciBpXG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInKSB7XG4gICAgZm9yIChpID0gc3RhcnQ7IGkgPCBlbmQ7IGkrKykge1xuICAgICAgdGhpc1tpXSA9IHZhbHVlXG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHZhciBieXRlcyA9IHV0ZjhUb0J5dGVzKHZhbHVlLnRvU3RyaW5nKCkpXG4gICAgdmFyIGxlbiA9IGJ5dGVzLmxlbmd0aFxuICAgIGZvciAoaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspIHtcbiAgICAgIHRoaXNbaV0gPSBieXRlc1tpICUgbGVuXVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiB0aGlzXG59XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBgQXJyYXlCdWZmZXJgIHdpdGggdGhlICpjb3BpZWQqIG1lbW9yeSBvZiB0aGUgYnVmZmVyIGluc3RhbmNlLlxuICogQWRkZWQgaW4gTm9kZSAwLjEyLiBPbmx5IGF2YWlsYWJsZSBpbiBicm93c2VycyB0aGF0IHN1cHBvcnQgQXJyYXlCdWZmZXIuXG4gKi9cbkJ1ZmZlci5wcm90b3R5cGUudG9BcnJheUJ1ZmZlciA9IGZ1bmN0aW9uIHRvQXJyYXlCdWZmZXIgKCkge1xuICBpZiAodHlwZW9mIFVpbnQ4QXJyYXkgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgaWYgKEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUKSB7XG4gICAgICByZXR1cm4gKG5ldyBCdWZmZXIodGhpcykpLmJ1ZmZlclxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgYnVmID0gbmV3IFVpbnQ4QXJyYXkodGhpcy5sZW5ndGgpXG4gICAgICBmb3IgKHZhciBpID0gMCwgbGVuID0gYnVmLmxlbmd0aDsgaSA8IGxlbjsgaSArPSAxKSB7XG4gICAgICAgIGJ1ZltpXSA9IHRoaXNbaV1cbiAgICAgIH1cbiAgICAgIHJldHVybiBidWYuYnVmZmVyXG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0J1ZmZlci50b0FycmF5QnVmZmVyIG5vdCBzdXBwb3J0ZWQgaW4gdGhpcyBicm93c2VyJylcbiAgfVxufVxuXG4vLyBIRUxQRVIgRlVOQ1RJT05TXG4vLyA9PT09PT09PT09PT09PT09XG5cbnZhciBCUCA9IEJ1ZmZlci5wcm90b3R5cGVcblxuLyoqXG4gKiBBdWdtZW50IGEgVWludDhBcnJheSAqaW5zdGFuY2UqIChub3QgdGhlIFVpbnQ4QXJyYXkgY2xhc3MhKSB3aXRoIEJ1ZmZlciBtZXRob2RzXG4gKi9cbkJ1ZmZlci5fYXVnbWVudCA9IGZ1bmN0aW9uIF9hdWdtZW50IChhcnIpIHtcbiAgYXJyLmNvbnN0cnVjdG9yID0gQnVmZmVyXG4gIGFyci5faXNCdWZmZXIgPSB0cnVlXG5cbiAgLy8gc2F2ZSByZWZlcmVuY2UgdG8gb3JpZ2luYWwgVWludDhBcnJheSBzZXQgbWV0aG9kIGJlZm9yZSBvdmVyd3JpdGluZ1xuICBhcnIuX3NldCA9IGFyci5zZXRcblxuICAvLyBkZXByZWNhdGVkXG4gIGFyci5nZXQgPSBCUC5nZXRcbiAgYXJyLnNldCA9IEJQLnNldFxuXG4gIGFyci53cml0ZSA9IEJQLndyaXRlXG4gIGFyci50b1N0cmluZyA9IEJQLnRvU3RyaW5nXG4gIGFyci50b0xvY2FsZVN0cmluZyA9IEJQLnRvU3RyaW5nXG4gIGFyci50b0pTT04gPSBCUC50b0pTT05cbiAgYXJyLmVxdWFscyA9IEJQLmVxdWFsc1xuICBhcnIuY29tcGFyZSA9IEJQLmNvbXBhcmVcbiAgYXJyLmluZGV4T2YgPSBCUC5pbmRleE9mXG4gIGFyci5jb3B5ID0gQlAuY29weVxuICBhcnIuc2xpY2UgPSBCUC5zbGljZVxuICBhcnIucmVhZFVJbnRMRSA9IEJQLnJlYWRVSW50TEVcbiAgYXJyLnJlYWRVSW50QkUgPSBCUC5yZWFkVUludEJFXG4gIGFyci5yZWFkVUludDggPSBCUC5yZWFkVUludDhcbiAgYXJyLnJlYWRVSW50MTZMRSA9IEJQLnJlYWRVSW50MTZMRVxuICBhcnIucmVhZFVJbnQxNkJFID0gQlAucmVhZFVJbnQxNkJFXG4gIGFyci5yZWFkVUludDMyTEUgPSBCUC5yZWFkVUludDMyTEVcbiAgYXJyLnJlYWRVSW50MzJCRSA9IEJQLnJlYWRVSW50MzJCRVxuICBhcnIucmVhZEludExFID0gQlAucmVhZEludExFXG4gIGFyci5yZWFkSW50QkUgPSBCUC5yZWFkSW50QkVcbiAgYXJyLnJlYWRJbnQ4ID0gQlAucmVhZEludDhcbiAgYXJyLnJlYWRJbnQxNkxFID0gQlAucmVhZEludDE2TEVcbiAgYXJyLnJlYWRJbnQxNkJFID0gQlAucmVhZEludDE2QkVcbiAgYXJyLnJlYWRJbnQzMkxFID0gQlAucmVhZEludDMyTEVcbiAgYXJyLnJlYWRJbnQzMkJFID0gQlAucmVhZEludDMyQkVcbiAgYXJyLnJlYWRGbG9hdExFID0gQlAucmVhZEZsb2F0TEVcbiAgYXJyLnJlYWRGbG9hdEJFID0gQlAucmVhZEZsb2F0QkVcbiAgYXJyLnJlYWREb3VibGVMRSA9IEJQLnJlYWREb3VibGVMRVxuICBhcnIucmVhZERvdWJsZUJFID0gQlAucmVhZERvdWJsZUJFXG4gIGFyci53cml0ZVVJbnQ4ID0gQlAud3JpdGVVSW50OFxuICBhcnIud3JpdGVVSW50TEUgPSBCUC53cml0ZVVJbnRMRVxuICBhcnIud3JpdGVVSW50QkUgPSBCUC53cml0ZVVJbnRCRVxuICBhcnIud3JpdGVVSW50MTZMRSA9IEJQLndyaXRlVUludDE2TEVcbiAgYXJyLndyaXRlVUludDE2QkUgPSBCUC53cml0ZVVJbnQxNkJFXG4gIGFyci53cml0ZVVJbnQzMkxFID0gQlAud3JpdGVVSW50MzJMRVxuICBhcnIud3JpdGVVSW50MzJCRSA9IEJQLndyaXRlVUludDMyQkVcbiAgYXJyLndyaXRlSW50TEUgPSBCUC53cml0ZUludExFXG4gIGFyci53cml0ZUludEJFID0gQlAud3JpdGVJbnRCRVxuICBhcnIud3JpdGVJbnQ4ID0gQlAud3JpdGVJbnQ4XG4gIGFyci53cml0ZUludDE2TEUgPSBCUC53cml0ZUludDE2TEVcbiAgYXJyLndyaXRlSW50MTZCRSA9IEJQLndyaXRlSW50MTZCRVxuICBhcnIud3JpdGVJbnQzMkxFID0gQlAud3JpdGVJbnQzMkxFXG4gIGFyci53cml0ZUludDMyQkUgPSBCUC53cml0ZUludDMyQkVcbiAgYXJyLndyaXRlRmxvYXRMRSA9IEJQLndyaXRlRmxvYXRMRVxuICBhcnIud3JpdGVGbG9hdEJFID0gQlAud3JpdGVGbG9hdEJFXG4gIGFyci53cml0ZURvdWJsZUxFID0gQlAud3JpdGVEb3VibGVMRVxuICBhcnIud3JpdGVEb3VibGVCRSA9IEJQLndyaXRlRG91YmxlQkVcbiAgYXJyLmZpbGwgPSBCUC5maWxsXG4gIGFyci5pbnNwZWN0ID0gQlAuaW5zcGVjdFxuICBhcnIudG9BcnJheUJ1ZmZlciA9IEJQLnRvQXJyYXlCdWZmZXJcblxuICByZXR1cm4gYXJyXG59XG5cbnZhciBJTlZBTElEX0JBU0U2NF9SRSA9IC9bXitcXC8wLTlBLVphLXotX10vZ1xuXG5mdW5jdGlvbiBiYXNlNjRjbGVhbiAoc3RyKSB7XG4gIC8vIE5vZGUgc3RyaXBzIG91dCBpbnZhbGlkIGNoYXJhY3RlcnMgbGlrZSBcXG4gYW5kIFxcdCBmcm9tIHRoZSBzdHJpbmcsIGJhc2U2NC1qcyBkb2VzIG5vdFxuICBzdHIgPSBzdHJpbmd0cmltKHN0cikucmVwbGFjZShJTlZBTElEX0JBU0U2NF9SRSwgJycpXG4gIC8vIE5vZGUgY29udmVydHMgc3RyaW5ncyB3aXRoIGxlbmd0aCA8IDIgdG8gJydcbiAgaWYgKHN0ci5sZW5ndGggPCAyKSByZXR1cm4gJydcbiAgLy8gTm9kZSBhbGxvd3MgZm9yIG5vbi1wYWRkZWQgYmFzZTY0IHN0cmluZ3MgKG1pc3NpbmcgdHJhaWxpbmcgPT09KSwgYmFzZTY0LWpzIGRvZXMgbm90XG4gIHdoaWxlIChzdHIubGVuZ3RoICUgNCAhPT0gMCkge1xuICAgIHN0ciA9IHN0ciArICc9J1xuICB9XG4gIHJldHVybiBzdHJcbn1cblxuZnVuY3Rpb24gc3RyaW5ndHJpbSAoc3RyKSB7XG4gIGlmIChzdHIudHJpbSkgcmV0dXJuIHN0ci50cmltKClcbiAgcmV0dXJuIHN0ci5yZXBsYWNlKC9eXFxzK3xcXHMrJC9nLCAnJylcbn1cblxuZnVuY3Rpb24gdG9IZXggKG4pIHtcbiAgaWYgKG4gPCAxNikgcmV0dXJuICcwJyArIG4udG9TdHJpbmcoMTYpXG4gIHJldHVybiBuLnRvU3RyaW5nKDE2KVxufVxuXG5mdW5jdGlvbiB1dGY4VG9CeXRlcyAoc3RyaW5nLCB1bml0cykge1xuICB1bml0cyA9IHVuaXRzIHx8IEluZmluaXR5XG4gIHZhciBjb2RlUG9pbnRcbiAgdmFyIGxlbmd0aCA9IHN0cmluZy5sZW5ndGhcbiAgdmFyIGxlYWRTdXJyb2dhdGUgPSBudWxsXG4gIHZhciBieXRlcyA9IFtdXG5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgIGNvZGVQb2ludCA9IHN0cmluZy5jaGFyQ29kZUF0KGkpXG5cbiAgICAvLyBpcyBzdXJyb2dhdGUgY29tcG9uZW50XG4gICAgaWYgKGNvZGVQb2ludCA+IDB4RDdGRiAmJiBjb2RlUG9pbnQgPCAweEUwMDApIHtcbiAgICAgIC8vIGxhc3QgY2hhciB3YXMgYSBsZWFkXG4gICAgICBpZiAoIWxlYWRTdXJyb2dhdGUpIHtcbiAgICAgICAgLy8gbm8gbGVhZCB5ZXRcbiAgICAgICAgaWYgKGNvZGVQb2ludCA+IDB4REJGRikge1xuICAgICAgICAgIC8vIHVuZXhwZWN0ZWQgdHJhaWxcbiAgICAgICAgICBpZiAoKHVuaXRzIC09IDMpID4gLTEpIGJ5dGVzLnB1c2goMHhFRiwgMHhCRiwgMHhCRClcbiAgICAgICAgICBjb250aW51ZVxuICAgICAgICB9IGVsc2UgaWYgKGkgKyAxID09PSBsZW5ndGgpIHtcbiAgICAgICAgICAvLyB1bnBhaXJlZCBsZWFkXG4gICAgICAgICAgaWYgKCh1bml0cyAtPSAzKSA+IC0xKSBieXRlcy5wdXNoKDB4RUYsIDB4QkYsIDB4QkQpXG4gICAgICAgICAgY29udGludWVcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHZhbGlkIGxlYWRcbiAgICAgICAgbGVhZFN1cnJvZ2F0ZSA9IGNvZGVQb2ludFxuXG4gICAgICAgIGNvbnRpbnVlXG4gICAgICB9XG5cbiAgICAgIC8vIDIgbGVhZHMgaW4gYSByb3dcbiAgICAgIGlmIChjb2RlUG9pbnQgPCAweERDMDApIHtcbiAgICAgICAgaWYgKCh1bml0cyAtPSAzKSA+IC0xKSBieXRlcy5wdXNoKDB4RUYsIDB4QkYsIDB4QkQpXG4gICAgICAgIGxlYWRTdXJyb2dhdGUgPSBjb2RlUG9pbnRcbiAgICAgICAgY29udGludWVcbiAgICAgIH1cblxuICAgICAgLy8gdmFsaWQgc3Vycm9nYXRlIHBhaXJcbiAgICAgIGNvZGVQb2ludCA9IChsZWFkU3Vycm9nYXRlIC0gMHhEODAwIDw8IDEwIHwgY29kZVBvaW50IC0gMHhEQzAwKSArIDB4MTAwMDBcbiAgICB9IGVsc2UgaWYgKGxlYWRTdXJyb2dhdGUpIHtcbiAgICAgIC8vIHZhbGlkIGJtcCBjaGFyLCBidXQgbGFzdCBjaGFyIHdhcyBhIGxlYWRcbiAgICAgIGlmICgodW5pdHMgLT0gMykgPiAtMSkgYnl0ZXMucHVzaCgweEVGLCAweEJGLCAweEJEKVxuICAgIH1cblxuICAgIGxlYWRTdXJyb2dhdGUgPSBudWxsXG5cbiAgICAvLyBlbmNvZGUgdXRmOFxuICAgIGlmIChjb2RlUG9pbnQgPCAweDgwKSB7XG4gICAgICBpZiAoKHVuaXRzIC09IDEpIDwgMCkgYnJlYWtcbiAgICAgIGJ5dGVzLnB1c2goY29kZVBvaW50KVxuICAgIH0gZWxzZSBpZiAoY29kZVBvaW50IDwgMHg4MDApIHtcbiAgICAgIGlmICgodW5pdHMgLT0gMikgPCAwKSBicmVha1xuICAgICAgYnl0ZXMucHVzaChcbiAgICAgICAgY29kZVBvaW50ID4+IDB4NiB8IDB4QzAsXG4gICAgICAgIGNvZGVQb2ludCAmIDB4M0YgfCAweDgwXG4gICAgICApXG4gICAgfSBlbHNlIGlmIChjb2RlUG9pbnQgPCAweDEwMDAwKSB7XG4gICAgICBpZiAoKHVuaXRzIC09IDMpIDwgMCkgYnJlYWtcbiAgICAgIGJ5dGVzLnB1c2goXG4gICAgICAgIGNvZGVQb2ludCA+PiAweEMgfCAweEUwLFxuICAgICAgICBjb2RlUG9pbnQgPj4gMHg2ICYgMHgzRiB8IDB4ODAsXG4gICAgICAgIGNvZGVQb2ludCAmIDB4M0YgfCAweDgwXG4gICAgICApXG4gICAgfSBlbHNlIGlmIChjb2RlUG9pbnQgPCAweDExMDAwMCkge1xuICAgICAgaWYgKCh1bml0cyAtPSA0KSA8IDApIGJyZWFrXG4gICAgICBieXRlcy5wdXNoKFxuICAgICAgICBjb2RlUG9pbnQgPj4gMHgxMiB8IDB4RjAsXG4gICAgICAgIGNvZGVQb2ludCA+PiAweEMgJiAweDNGIHwgMHg4MCxcbiAgICAgICAgY29kZVBvaW50ID4+IDB4NiAmIDB4M0YgfCAweDgwLFxuICAgICAgICBjb2RlUG9pbnQgJiAweDNGIHwgMHg4MFxuICAgICAgKVxuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgY29kZSBwb2ludCcpXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGJ5dGVzXG59XG5cbmZ1bmN0aW9uIGFzY2lpVG9CeXRlcyAoc3RyKSB7XG4gIHZhciBieXRlQXJyYXkgPSBbXVxuICBmb3IgKHZhciBpID0gMDsgaSA8IHN0ci5sZW5ndGg7IGkrKykge1xuICAgIC8vIE5vZGUncyBjb2RlIHNlZW1zIHRvIGJlIGRvaW5nIHRoaXMgYW5kIG5vdCAmIDB4N0YuLlxuICAgIGJ5dGVBcnJheS5wdXNoKHN0ci5jaGFyQ29kZUF0KGkpICYgMHhGRilcbiAgfVxuICByZXR1cm4gYnl0ZUFycmF5XG59XG5cbmZ1bmN0aW9uIHV0ZjE2bGVUb0J5dGVzIChzdHIsIHVuaXRzKSB7XG4gIHZhciBjLCBoaSwgbG9cbiAgdmFyIGJ5dGVBcnJheSA9IFtdXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc3RyLmxlbmd0aDsgaSsrKSB7XG4gICAgaWYgKCh1bml0cyAtPSAyKSA8IDApIGJyZWFrXG5cbiAgICBjID0gc3RyLmNoYXJDb2RlQXQoaSlcbiAgICBoaSA9IGMgPj4gOFxuICAgIGxvID0gYyAlIDI1NlxuICAgIGJ5dGVBcnJheS5wdXNoKGxvKVxuICAgIGJ5dGVBcnJheS5wdXNoKGhpKVxuICB9XG5cbiAgcmV0dXJuIGJ5dGVBcnJheVxufVxuXG5mdW5jdGlvbiBiYXNlNjRUb0J5dGVzIChzdHIpIHtcbiAgcmV0dXJuIGJhc2U2NC50b0J5dGVBcnJheShiYXNlNjRjbGVhbihzdHIpKVxufVxuXG5mdW5jdGlvbiBibGl0QnVmZmVyIChzcmMsIGRzdCwgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgIGlmICgoaSArIG9mZnNldCA+PSBkc3QubGVuZ3RoKSB8fCAoaSA+PSBzcmMubGVuZ3RoKSkgYnJlYWtcbiAgICBkc3RbaSArIG9mZnNldF0gPSBzcmNbaV1cbiAgfVxuICByZXR1cm4gaVxufVxuIiwidmFyIGxvb2t1cCA9ICdBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWmFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6MDEyMzQ1Njc4OSsvJztcblxuOyhmdW5jdGlvbiAoZXhwb3J0cykge1xuXHQndXNlIHN0cmljdCc7XG5cbiAgdmFyIEFyciA9ICh0eXBlb2YgVWludDhBcnJheSAhPT0gJ3VuZGVmaW5lZCcpXG4gICAgPyBVaW50OEFycmF5XG4gICAgOiBBcnJheVxuXG5cdHZhciBQTFVTICAgPSAnKycuY2hhckNvZGVBdCgwKVxuXHR2YXIgU0xBU0ggID0gJy8nLmNoYXJDb2RlQXQoMClcblx0dmFyIE5VTUJFUiA9ICcwJy5jaGFyQ29kZUF0KDApXG5cdHZhciBMT1dFUiAgPSAnYScuY2hhckNvZGVBdCgwKVxuXHR2YXIgVVBQRVIgID0gJ0EnLmNoYXJDb2RlQXQoMClcblx0dmFyIFBMVVNfVVJMX1NBRkUgPSAnLScuY2hhckNvZGVBdCgwKVxuXHR2YXIgU0xBU0hfVVJMX1NBRkUgPSAnXycuY2hhckNvZGVBdCgwKVxuXG5cdGZ1bmN0aW9uIGRlY29kZSAoZWx0KSB7XG5cdFx0dmFyIGNvZGUgPSBlbHQuY2hhckNvZGVBdCgwKVxuXHRcdGlmIChjb2RlID09PSBQTFVTIHx8XG5cdFx0ICAgIGNvZGUgPT09IFBMVVNfVVJMX1NBRkUpXG5cdFx0XHRyZXR1cm4gNjIgLy8gJysnXG5cdFx0aWYgKGNvZGUgPT09IFNMQVNIIHx8XG5cdFx0ICAgIGNvZGUgPT09IFNMQVNIX1VSTF9TQUZFKVxuXHRcdFx0cmV0dXJuIDYzIC8vICcvJ1xuXHRcdGlmIChjb2RlIDwgTlVNQkVSKVxuXHRcdFx0cmV0dXJuIC0xIC8vbm8gbWF0Y2hcblx0XHRpZiAoY29kZSA8IE5VTUJFUiArIDEwKVxuXHRcdFx0cmV0dXJuIGNvZGUgLSBOVU1CRVIgKyAyNiArIDI2XG5cdFx0aWYgKGNvZGUgPCBVUFBFUiArIDI2KVxuXHRcdFx0cmV0dXJuIGNvZGUgLSBVUFBFUlxuXHRcdGlmIChjb2RlIDwgTE9XRVIgKyAyNilcblx0XHRcdHJldHVybiBjb2RlIC0gTE9XRVIgKyAyNlxuXHR9XG5cblx0ZnVuY3Rpb24gYjY0VG9CeXRlQXJyYXkgKGI2NCkge1xuXHRcdHZhciBpLCBqLCBsLCB0bXAsIHBsYWNlSG9sZGVycywgYXJyXG5cblx0XHRpZiAoYjY0Lmxlbmd0aCAlIDQgPiAwKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgc3RyaW5nLiBMZW5ndGggbXVzdCBiZSBhIG11bHRpcGxlIG9mIDQnKVxuXHRcdH1cblxuXHRcdC8vIHRoZSBudW1iZXIgb2YgZXF1YWwgc2lnbnMgKHBsYWNlIGhvbGRlcnMpXG5cdFx0Ly8gaWYgdGhlcmUgYXJlIHR3byBwbGFjZWhvbGRlcnMsIHRoYW4gdGhlIHR3byBjaGFyYWN0ZXJzIGJlZm9yZSBpdFxuXHRcdC8vIHJlcHJlc2VudCBvbmUgYnl0ZVxuXHRcdC8vIGlmIHRoZXJlIGlzIG9ubHkgb25lLCB0aGVuIHRoZSB0aHJlZSBjaGFyYWN0ZXJzIGJlZm9yZSBpdCByZXByZXNlbnQgMiBieXRlc1xuXHRcdC8vIHRoaXMgaXMganVzdCBhIGNoZWFwIGhhY2sgdG8gbm90IGRvIGluZGV4T2YgdHdpY2Vcblx0XHR2YXIgbGVuID0gYjY0Lmxlbmd0aFxuXHRcdHBsYWNlSG9sZGVycyA9ICc9JyA9PT0gYjY0LmNoYXJBdChsZW4gLSAyKSA/IDIgOiAnPScgPT09IGI2NC5jaGFyQXQobGVuIC0gMSkgPyAxIDogMFxuXG5cdFx0Ly8gYmFzZTY0IGlzIDQvMyArIHVwIHRvIHR3byBjaGFyYWN0ZXJzIG9mIHRoZSBvcmlnaW5hbCBkYXRhXG5cdFx0YXJyID0gbmV3IEFycihiNjQubGVuZ3RoICogMyAvIDQgLSBwbGFjZUhvbGRlcnMpXG5cblx0XHQvLyBpZiB0aGVyZSBhcmUgcGxhY2Vob2xkZXJzLCBvbmx5IGdldCB1cCB0byB0aGUgbGFzdCBjb21wbGV0ZSA0IGNoYXJzXG5cdFx0bCA9IHBsYWNlSG9sZGVycyA+IDAgPyBiNjQubGVuZ3RoIC0gNCA6IGI2NC5sZW5ndGhcblxuXHRcdHZhciBMID0gMFxuXG5cdFx0ZnVuY3Rpb24gcHVzaCAodikge1xuXHRcdFx0YXJyW0wrK10gPSB2XG5cdFx0fVxuXG5cdFx0Zm9yIChpID0gMCwgaiA9IDA7IGkgPCBsOyBpICs9IDQsIGogKz0gMykge1xuXHRcdFx0dG1wID0gKGRlY29kZShiNjQuY2hhckF0KGkpKSA8PCAxOCkgfCAoZGVjb2RlKGI2NC5jaGFyQXQoaSArIDEpKSA8PCAxMikgfCAoZGVjb2RlKGI2NC5jaGFyQXQoaSArIDIpKSA8PCA2KSB8IGRlY29kZShiNjQuY2hhckF0KGkgKyAzKSlcblx0XHRcdHB1c2goKHRtcCAmIDB4RkYwMDAwKSA+PiAxNilcblx0XHRcdHB1c2goKHRtcCAmIDB4RkYwMCkgPj4gOClcblx0XHRcdHB1c2godG1wICYgMHhGRilcblx0XHR9XG5cblx0XHRpZiAocGxhY2VIb2xkZXJzID09PSAyKSB7XG5cdFx0XHR0bXAgPSAoZGVjb2RlKGI2NC5jaGFyQXQoaSkpIDw8IDIpIHwgKGRlY29kZShiNjQuY2hhckF0KGkgKyAxKSkgPj4gNClcblx0XHRcdHB1c2godG1wICYgMHhGRilcblx0XHR9IGVsc2UgaWYgKHBsYWNlSG9sZGVycyA9PT0gMSkge1xuXHRcdFx0dG1wID0gKGRlY29kZShiNjQuY2hhckF0KGkpKSA8PCAxMCkgfCAoZGVjb2RlKGI2NC5jaGFyQXQoaSArIDEpKSA8PCA0KSB8IChkZWNvZGUoYjY0LmNoYXJBdChpICsgMikpID4+IDIpXG5cdFx0XHRwdXNoKCh0bXAgPj4gOCkgJiAweEZGKVxuXHRcdFx0cHVzaCh0bXAgJiAweEZGKVxuXHRcdH1cblxuXHRcdHJldHVybiBhcnJcblx0fVxuXG5cdGZ1bmN0aW9uIHVpbnQ4VG9CYXNlNjQgKHVpbnQ4KSB7XG5cdFx0dmFyIGksXG5cdFx0XHRleHRyYUJ5dGVzID0gdWludDgubGVuZ3RoICUgMywgLy8gaWYgd2UgaGF2ZSAxIGJ5dGUgbGVmdCwgcGFkIDIgYnl0ZXNcblx0XHRcdG91dHB1dCA9IFwiXCIsXG5cdFx0XHR0ZW1wLCBsZW5ndGhcblxuXHRcdGZ1bmN0aW9uIGVuY29kZSAobnVtKSB7XG5cdFx0XHRyZXR1cm4gbG9va3VwLmNoYXJBdChudW0pXG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gdHJpcGxldFRvQmFzZTY0IChudW0pIHtcblx0XHRcdHJldHVybiBlbmNvZGUobnVtID4+IDE4ICYgMHgzRikgKyBlbmNvZGUobnVtID4+IDEyICYgMHgzRikgKyBlbmNvZGUobnVtID4+IDYgJiAweDNGKSArIGVuY29kZShudW0gJiAweDNGKVxuXHRcdH1cblxuXHRcdC8vIGdvIHRocm91Z2ggdGhlIGFycmF5IGV2ZXJ5IHRocmVlIGJ5dGVzLCB3ZSdsbCBkZWFsIHdpdGggdHJhaWxpbmcgc3R1ZmYgbGF0ZXJcblx0XHRmb3IgKGkgPSAwLCBsZW5ndGggPSB1aW50OC5sZW5ndGggLSBleHRyYUJ5dGVzOyBpIDwgbGVuZ3RoOyBpICs9IDMpIHtcblx0XHRcdHRlbXAgPSAodWludDhbaV0gPDwgMTYpICsgKHVpbnQ4W2kgKyAxXSA8PCA4KSArICh1aW50OFtpICsgMl0pXG5cdFx0XHRvdXRwdXQgKz0gdHJpcGxldFRvQmFzZTY0KHRlbXApXG5cdFx0fVxuXG5cdFx0Ly8gcGFkIHRoZSBlbmQgd2l0aCB6ZXJvcywgYnV0IG1ha2Ugc3VyZSB0byBub3QgZm9yZ2V0IHRoZSBleHRyYSBieXRlc1xuXHRcdHN3aXRjaCAoZXh0cmFCeXRlcykge1xuXHRcdFx0Y2FzZSAxOlxuXHRcdFx0XHR0ZW1wID0gdWludDhbdWludDgubGVuZ3RoIC0gMV1cblx0XHRcdFx0b3V0cHV0ICs9IGVuY29kZSh0ZW1wID4+IDIpXG5cdFx0XHRcdG91dHB1dCArPSBlbmNvZGUoKHRlbXAgPDwgNCkgJiAweDNGKVxuXHRcdFx0XHRvdXRwdXQgKz0gJz09J1xuXHRcdFx0XHRicmVha1xuXHRcdFx0Y2FzZSAyOlxuXHRcdFx0XHR0ZW1wID0gKHVpbnQ4W3VpbnQ4Lmxlbmd0aCAtIDJdIDw8IDgpICsgKHVpbnQ4W3VpbnQ4Lmxlbmd0aCAtIDFdKVxuXHRcdFx0XHRvdXRwdXQgKz0gZW5jb2RlKHRlbXAgPj4gMTApXG5cdFx0XHRcdG91dHB1dCArPSBlbmNvZGUoKHRlbXAgPj4gNCkgJiAweDNGKVxuXHRcdFx0XHRvdXRwdXQgKz0gZW5jb2RlKCh0ZW1wIDw8IDIpICYgMHgzRilcblx0XHRcdFx0b3V0cHV0ICs9ICc9J1xuXHRcdFx0XHRicmVha1xuXHRcdH1cblxuXHRcdHJldHVybiBvdXRwdXRcblx0fVxuXG5cdGV4cG9ydHMudG9CeXRlQXJyYXkgPSBiNjRUb0J5dGVBcnJheVxuXHRleHBvcnRzLmZyb21CeXRlQXJyYXkgPSB1aW50OFRvQmFzZTY0XG59KHR5cGVvZiBleHBvcnRzID09PSAndW5kZWZpbmVkJyA/ICh0aGlzLmJhc2U2NGpzID0ge30pIDogZXhwb3J0cykpXG4iLCJleHBvcnRzLnJlYWQgPSBmdW5jdGlvbiAoYnVmZmVyLCBvZmZzZXQsIGlzTEUsIG1MZW4sIG5CeXRlcykge1xuICB2YXIgZSwgbVxuICB2YXIgZUxlbiA9IG5CeXRlcyAqIDggLSBtTGVuIC0gMVxuICB2YXIgZU1heCA9ICgxIDw8IGVMZW4pIC0gMVxuICB2YXIgZUJpYXMgPSBlTWF4ID4+IDFcbiAgdmFyIG5CaXRzID0gLTdcbiAgdmFyIGkgPSBpc0xFID8gKG5CeXRlcyAtIDEpIDogMFxuICB2YXIgZCA9IGlzTEUgPyAtMSA6IDFcbiAgdmFyIHMgPSBidWZmZXJbb2Zmc2V0ICsgaV1cblxuICBpICs9IGRcblxuICBlID0gcyAmICgoMSA8PCAoLW5CaXRzKSkgLSAxKVxuICBzID4+PSAoLW5CaXRzKVxuICBuQml0cyArPSBlTGVuXG4gIGZvciAoOyBuQml0cyA+IDA7IGUgPSBlICogMjU2ICsgYnVmZmVyW29mZnNldCArIGldLCBpICs9IGQsIG5CaXRzIC09IDgpIHt9XG5cbiAgbSA9IGUgJiAoKDEgPDwgKC1uQml0cykpIC0gMSlcbiAgZSA+Pj0gKC1uQml0cylcbiAgbkJpdHMgKz0gbUxlblxuICBmb3IgKDsgbkJpdHMgPiAwOyBtID0gbSAqIDI1NiArIGJ1ZmZlcltvZmZzZXQgKyBpXSwgaSArPSBkLCBuQml0cyAtPSA4KSB7fVxuXG4gIGlmIChlID09PSAwKSB7XG4gICAgZSA9IDEgLSBlQmlhc1xuICB9IGVsc2UgaWYgKGUgPT09IGVNYXgpIHtcbiAgICByZXR1cm4gbSA/IE5hTiA6ICgocyA/IC0xIDogMSkgKiBJbmZpbml0eSlcbiAgfSBlbHNlIHtcbiAgICBtID0gbSArIE1hdGgucG93KDIsIG1MZW4pXG4gICAgZSA9IGUgLSBlQmlhc1xuICB9XG4gIHJldHVybiAocyA/IC0xIDogMSkgKiBtICogTWF0aC5wb3coMiwgZSAtIG1MZW4pXG59XG5cbmV4cG9ydHMud3JpdGUgPSBmdW5jdGlvbiAoYnVmZmVyLCB2YWx1ZSwgb2Zmc2V0LCBpc0xFLCBtTGVuLCBuQnl0ZXMpIHtcbiAgdmFyIGUsIG0sIGNcbiAgdmFyIGVMZW4gPSBuQnl0ZXMgKiA4IC0gbUxlbiAtIDFcbiAgdmFyIGVNYXggPSAoMSA8PCBlTGVuKSAtIDFcbiAgdmFyIGVCaWFzID0gZU1heCA+PiAxXG4gIHZhciBydCA9IChtTGVuID09PSAyMyA/IE1hdGgucG93KDIsIC0yNCkgLSBNYXRoLnBvdygyLCAtNzcpIDogMClcbiAgdmFyIGkgPSBpc0xFID8gMCA6IChuQnl0ZXMgLSAxKVxuICB2YXIgZCA9IGlzTEUgPyAxIDogLTFcbiAgdmFyIHMgPSB2YWx1ZSA8IDAgfHwgKHZhbHVlID09PSAwICYmIDEgLyB2YWx1ZSA8IDApID8gMSA6IDBcblxuICB2YWx1ZSA9IE1hdGguYWJzKHZhbHVlKVxuXG4gIGlmIChpc05hTih2YWx1ZSkgfHwgdmFsdWUgPT09IEluZmluaXR5KSB7XG4gICAgbSA9IGlzTmFOKHZhbHVlKSA/IDEgOiAwXG4gICAgZSA9IGVNYXhcbiAgfSBlbHNlIHtcbiAgICBlID0gTWF0aC5mbG9vcihNYXRoLmxvZyh2YWx1ZSkgLyBNYXRoLkxOMilcbiAgICBpZiAodmFsdWUgKiAoYyA9IE1hdGgucG93KDIsIC1lKSkgPCAxKSB7XG4gICAgICBlLS1cbiAgICAgIGMgKj0gMlxuICAgIH1cbiAgICBpZiAoZSArIGVCaWFzID49IDEpIHtcbiAgICAgIHZhbHVlICs9IHJ0IC8gY1xuICAgIH0gZWxzZSB7XG4gICAgICB2YWx1ZSArPSBydCAqIE1hdGgucG93KDIsIDEgLSBlQmlhcylcbiAgICB9XG4gICAgaWYgKHZhbHVlICogYyA+PSAyKSB7XG4gICAgICBlKytcbiAgICAgIGMgLz0gMlxuICAgIH1cblxuICAgIGlmIChlICsgZUJpYXMgPj0gZU1heCkge1xuICAgICAgbSA9IDBcbiAgICAgIGUgPSBlTWF4XG4gICAgfSBlbHNlIGlmIChlICsgZUJpYXMgPj0gMSkge1xuICAgICAgbSA9ICh2YWx1ZSAqIGMgLSAxKSAqIE1hdGgucG93KDIsIG1MZW4pXG4gICAgICBlID0gZSArIGVCaWFzXG4gICAgfSBlbHNlIHtcbiAgICAgIG0gPSB2YWx1ZSAqIE1hdGgucG93KDIsIGVCaWFzIC0gMSkgKiBNYXRoLnBvdygyLCBtTGVuKVxuICAgICAgZSA9IDBcbiAgICB9XG4gIH1cblxuICBmb3IgKDsgbUxlbiA+PSA4OyBidWZmZXJbb2Zmc2V0ICsgaV0gPSBtICYgMHhmZiwgaSArPSBkLCBtIC89IDI1NiwgbUxlbiAtPSA4KSB7fVxuXG4gIGUgPSAoZSA8PCBtTGVuKSB8IG1cbiAgZUxlbiArPSBtTGVuXG4gIGZvciAoOyBlTGVuID4gMDsgYnVmZmVyW29mZnNldCArIGldID0gZSAmIDB4ZmYsIGkgKz0gZCwgZSAvPSAyNTYsIGVMZW4gLT0gOCkge31cblxuICBidWZmZXJbb2Zmc2V0ICsgaSAtIGRdIHw9IHMgKiAxMjhcbn1cbiIsIlxuLyoqXG4gKiBpc0FycmF5XG4gKi9cblxudmFyIGlzQXJyYXkgPSBBcnJheS5pc0FycmF5O1xuXG4vKipcbiAqIHRvU3RyaW5nXG4gKi9cblxudmFyIHN0ciA9IE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmc7XG5cbi8qKlxuICogV2hldGhlciBvciBub3QgdGhlIGdpdmVuIGB2YWxgXG4gKiBpcyBhbiBhcnJheS5cbiAqXG4gKiBleGFtcGxlOlxuICpcbiAqICAgICAgICBpc0FycmF5KFtdKTtcbiAqICAgICAgICAvLyA+IHRydWVcbiAqICAgICAgICBpc0FycmF5KGFyZ3VtZW50cyk7XG4gKiAgICAgICAgLy8gPiBmYWxzZVxuICogICAgICAgIGlzQXJyYXkoJycpO1xuICogICAgICAgIC8vID4gZmFsc2VcbiAqXG4gKiBAcGFyYW0ge21peGVkfSB2YWxcbiAqIEByZXR1cm4ge2Jvb2x9XG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBpc0FycmF5IHx8IGZ1bmN0aW9uICh2YWwpIHtcbiAgcmV0dXJuICEhIHZhbCAmJiAnW29iamVjdCBBcnJheV0nID09IHN0ci5jYWxsKHZhbCk7XG59O1xuIiwiLypcblxuICBKYXZhc2NyaXB0IFN0YXRlIE1hY2hpbmUgTGlicmFyeSAtIGh0dHBzOi8vZ2l0aHViLmNvbS9qYWtlc2dvcmRvbi9qYXZhc2NyaXB0LXN0YXRlLW1hY2hpbmVcblxuICBDb3B5cmlnaHQgKGMpIDIwMTIsIDIwMTMsIDIwMTQsIDIwMTUsIEpha2UgR29yZG9uIGFuZCBjb250cmlidXRvcnNcbiAgUmVsZWFzZWQgdW5kZXIgdGhlIE1JVCBsaWNlbnNlIC0gaHR0cHM6Ly9naXRodWIuY29tL2pha2VzZ29yZG9uL2phdmFzY3JpcHQtc3RhdGUtbWFjaGluZS9ibG9iL21hc3Rlci9MSUNFTlNFXG5cbiovXG5cbihmdW5jdGlvbiAoKSB7XG5cbiAgdmFyIFN0YXRlTWFjaGluZSA9IHtcblxuICAgIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgICBWRVJTSU9OOiBcIjIuMy41XCIsXG5cbiAgICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gICAgUmVzdWx0OiB7XG4gICAgICBTVUNDRUVERUQ6ICAgIDEsIC8vIHRoZSBldmVudCB0cmFuc2l0aW9uZWQgc3VjY2Vzc2Z1bGx5IGZyb20gb25lIHN0YXRlIHRvIGFub3RoZXJcbiAgICAgIE5PVFJBTlNJVElPTjogMiwgLy8gdGhlIGV2ZW50IHdhcyBzdWNjZXNzZnVsbCBidXQgbm8gc3RhdGUgdHJhbnNpdGlvbiB3YXMgbmVjZXNzYXJ5XG4gICAgICBDQU5DRUxMRUQ6ICAgIDMsIC8vIHRoZSBldmVudCB3YXMgY2FuY2VsbGVkIGJ5IHRoZSBjYWxsZXIgaW4gYSBiZWZvcmVFdmVudCBjYWxsYmFja1xuICAgICAgUEVORElORzogICAgICA0ICAvLyB0aGUgZXZlbnQgaXMgYXN5bmNocm9ub3VzIGFuZCB0aGUgY2FsbGVyIGlzIGluIGNvbnRyb2wgb2Ygd2hlbiB0aGUgdHJhbnNpdGlvbiBvY2N1cnNcbiAgICB9LFxuXG4gICAgRXJyb3I6IHtcbiAgICAgIElOVkFMSURfVFJBTlNJVElPTjogMTAwLCAvLyBjYWxsZXIgdHJpZWQgdG8gZmlyZSBhbiBldmVudCB0aGF0IHdhcyBpbm5hcHJvcHJpYXRlIGluIHRoZSBjdXJyZW50IHN0YXRlXG4gICAgICBQRU5ESU5HX1RSQU5TSVRJT046IDIwMCwgLy8gY2FsbGVyIHRyaWVkIHRvIGZpcmUgYW4gZXZlbnQgd2hpbGUgYW4gYXN5bmMgdHJhbnNpdGlvbiB3YXMgc3RpbGwgcGVuZGluZ1xuICAgICAgSU5WQUxJRF9DQUxMQkFDSzogICAzMDAgLy8gY2FsbGVyIHByb3ZpZGVkIGNhbGxiYWNrIGZ1bmN0aW9uIHRocmV3IGFuIGV4Y2VwdGlvblxuICAgIH0sXG5cbiAgICBXSUxEQ0FSRDogJyonLFxuICAgIEFTWU5DOiAnYXN5bmMnLFxuXG4gICAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICAgIGNyZWF0ZTogZnVuY3Rpb24oY2ZnLCB0YXJnZXQpIHtcblxuICAgICAgdmFyIGluaXRpYWwgICAgICA9ICh0eXBlb2YgY2ZnLmluaXRpYWwgPT0gJ3N0cmluZycpID8geyBzdGF0ZTogY2ZnLmluaXRpYWwgfSA6IGNmZy5pbml0aWFsOyAvLyBhbGxvdyBmb3IgYSBzaW1wbGUgc3RyaW5nLCBvciBhbiBvYmplY3Qgd2l0aCB7IHN0YXRlOiAnZm9vJywgZXZlbnQ6ICdzZXR1cCcsIGRlZmVyOiB0cnVlfGZhbHNlIH1cbiAgICAgIHZhciB0ZXJtaW5hbCAgICAgPSBjZmcudGVybWluYWwgfHwgY2ZnWydmaW5hbCddO1xuICAgICAgdmFyIGZzbSAgICAgICAgICA9IHRhcmdldCB8fCBjZmcudGFyZ2V0ICB8fCB7fTtcbiAgICAgIHZhciBldmVudHMgICAgICAgPSBjZmcuZXZlbnRzIHx8IFtdO1xuICAgICAgdmFyIGNhbGxiYWNrcyAgICA9IGNmZy5jYWxsYmFja3MgfHwge307XG4gICAgICB2YXIgbWFwICAgICAgICAgID0ge307IC8vIHRyYWNrIHN0YXRlIHRyYW5zaXRpb25zIGFsbG93ZWQgZm9yIGFuIGV2ZW50IHsgZXZlbnQ6IHsgZnJvbTogWyB0byBdIH0gfVxuICAgICAgdmFyIHRyYW5zaXRpb25zICA9IHt9OyAvLyB0cmFjayBldmVudHMgYWxsb3dlZCBmcm9tIGEgc3RhdGUgICAgICAgICAgICB7IHN0YXRlOiBbIGV2ZW50IF0gfVxuXG4gICAgICB2YXIgYWRkID0gZnVuY3Rpb24oZSkge1xuICAgICAgICB2YXIgZnJvbSA9IChlLmZyb20gaW5zdGFuY2VvZiBBcnJheSkgPyBlLmZyb20gOiAoZS5mcm9tID8gW2UuZnJvbV0gOiBbU3RhdGVNYWNoaW5lLldJTERDQVJEXSk7IC8vIGFsbG93ICd3aWxkY2FyZCcgdHJhbnNpdGlvbiBpZiAnZnJvbScgaXMgbm90IHNwZWNpZmllZFxuICAgICAgICBtYXBbZS5uYW1lXSA9IG1hcFtlLm5hbWVdIHx8IHt9O1xuICAgICAgICBmb3IgKHZhciBuID0gMCA7IG4gPCBmcm9tLmxlbmd0aCA7IG4rKykge1xuICAgICAgICAgIHRyYW5zaXRpb25zW2Zyb21bbl1dID0gdHJhbnNpdGlvbnNbZnJvbVtuXV0gfHwgW107XG4gICAgICAgICAgdHJhbnNpdGlvbnNbZnJvbVtuXV0ucHVzaChlLm5hbWUpO1xuXG4gICAgICAgICAgbWFwW2UubmFtZV1bZnJvbVtuXV0gPSBlLnRvIHx8IGZyb21bbl07IC8vIGFsbG93IG5vLW9wIHRyYW5zaXRpb24gaWYgJ3RvJyBpcyBub3Qgc3BlY2lmaWVkXG4gICAgICAgIH1cbiAgICAgIH07XG5cbiAgICAgIGlmIChpbml0aWFsKSB7XG4gICAgICAgIGluaXRpYWwuZXZlbnQgPSBpbml0aWFsLmV2ZW50IHx8ICdzdGFydHVwJztcbiAgICAgICAgYWRkKHsgbmFtZTogaW5pdGlhbC5ldmVudCwgZnJvbTogJ25vbmUnLCB0bzogaW5pdGlhbC5zdGF0ZSB9KTtcbiAgICAgIH1cblxuICAgICAgZm9yKHZhciBuID0gMCA7IG4gPCBldmVudHMubGVuZ3RoIDsgbisrKVxuICAgICAgICBhZGQoZXZlbnRzW25dKTtcblxuICAgICAgZm9yKHZhciBuYW1lIGluIG1hcCkge1xuICAgICAgICBpZiAobWFwLmhhc093blByb3BlcnR5KG5hbWUpKVxuICAgICAgICAgIGZzbVtuYW1lXSA9IFN0YXRlTWFjaGluZS5idWlsZEV2ZW50KG5hbWUsIG1hcFtuYW1lXSk7XG4gICAgICB9XG5cbiAgICAgIGZvcih2YXIgbmFtZSBpbiBjYWxsYmFja3MpIHtcbiAgICAgICAgaWYgKGNhbGxiYWNrcy5oYXNPd25Qcm9wZXJ0eShuYW1lKSlcbiAgICAgICAgICBmc21bbmFtZV0gPSBjYWxsYmFja3NbbmFtZV1cbiAgICAgIH1cblxuICAgICAgZnNtLmN1cnJlbnQgICAgID0gJ25vbmUnO1xuICAgICAgZnNtLmlzICAgICAgICAgID0gZnVuY3Rpb24oc3RhdGUpIHsgcmV0dXJuIChzdGF0ZSBpbnN0YW5jZW9mIEFycmF5KSA/IChzdGF0ZS5pbmRleE9mKHRoaXMuY3VycmVudCkgPj0gMCkgOiAodGhpcy5jdXJyZW50ID09PSBzdGF0ZSk7IH07XG4gICAgICBmc20uY2FuICAgICAgICAgPSBmdW5jdGlvbihldmVudCkgeyByZXR1cm4gIXRoaXMudHJhbnNpdGlvbiAmJiAobWFwW2V2ZW50XS5oYXNPd25Qcm9wZXJ0eSh0aGlzLmN1cnJlbnQpIHx8IG1hcFtldmVudF0uaGFzT3duUHJvcGVydHkoU3RhdGVNYWNoaW5lLldJTERDQVJEKSk7IH1cbiAgICAgIGZzbS5jYW5ub3QgICAgICA9IGZ1bmN0aW9uKGV2ZW50KSB7IHJldHVybiAhdGhpcy5jYW4oZXZlbnQpOyB9O1xuICAgICAgZnNtLnRyYW5zaXRpb25zID0gZnVuY3Rpb24oKSAgICAgIHsgcmV0dXJuIHRyYW5zaXRpb25zW3RoaXMuY3VycmVudF07IH07XG4gICAgICBmc20uaXNGaW5pc2hlZCAgPSBmdW5jdGlvbigpICAgICAgeyByZXR1cm4gdGhpcy5pcyh0ZXJtaW5hbCk7IH07XG4gICAgICBmc20uZXJyb3IgICAgICAgPSBjZmcuZXJyb3IgfHwgZnVuY3Rpb24obmFtZSwgZnJvbSwgdG8sIGFyZ3MsIGVycm9yLCBtc2csIGUpIHsgdGhyb3cgZSB8fCBtc2c7IH07IC8vIGRlZmF1bHQgYmVoYXZpb3Igd2hlbiBzb21ldGhpbmcgdW5leHBlY3RlZCBoYXBwZW5zIGlzIHRvIHRocm93IGFuIGV4Y2VwdGlvbiwgYnV0IGNhbGxlciBjYW4gb3ZlcnJpZGUgdGhpcyBiZWhhdmlvciBpZiBkZXNpcmVkIChzZWUgZ2l0aHViIGlzc3VlICMzIGFuZCAjMTcpXG5cbiAgICAgIGlmIChpbml0aWFsICYmICFpbml0aWFsLmRlZmVyKVxuICAgICAgICBmc21baW5pdGlhbC5ldmVudF0oKTtcblxuICAgICAgcmV0dXJuIGZzbTtcblxuICAgIH0sXG5cbiAgICAvLz09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4gICAgZG9DYWxsYmFjazogZnVuY3Rpb24oZnNtLCBmdW5jLCBuYW1lLCBmcm9tLCB0bywgYXJncykge1xuICAgICAgaWYgKGZ1bmMpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICByZXR1cm4gZnVuYy5hcHBseShmc20sIFtuYW1lLCBmcm9tLCB0b10uY29uY2F0KGFyZ3MpKTtcbiAgICAgICAgfVxuICAgICAgICBjYXRjaChlKSB7XG4gICAgICAgICAgcmV0dXJuIGZzbS5lcnJvcihuYW1lLCBmcm9tLCB0bywgYXJncywgU3RhdGVNYWNoaW5lLkVycm9yLklOVkFMSURfQ0FMTEJBQ0ssIFwiYW4gZXhjZXB0aW9uIG9jY3VycmVkIGluIGEgY2FsbGVyLXByb3ZpZGVkIGNhbGxiYWNrIGZ1bmN0aW9uXCIsIGUpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcblxuICAgIGJlZm9yZUFueUV2ZW50OiAgZnVuY3Rpb24oZnNtLCBuYW1lLCBmcm9tLCB0bywgYXJncykgeyByZXR1cm4gU3RhdGVNYWNoaW5lLmRvQ2FsbGJhY2soZnNtLCBmc21bJ29uYmVmb3JlZXZlbnQnXSwgICAgICAgICAgICAgICAgICAgICAgIG5hbWUsIGZyb20sIHRvLCBhcmdzKTsgfSxcbiAgICBhZnRlckFueUV2ZW50OiAgIGZ1bmN0aW9uKGZzbSwgbmFtZSwgZnJvbSwgdG8sIGFyZ3MpIHsgcmV0dXJuIFN0YXRlTWFjaGluZS5kb0NhbGxiYWNrKGZzbSwgZnNtWydvbmFmdGVyZXZlbnQnXSB8fCBmc21bJ29uZXZlbnQnXSwgICAgICBuYW1lLCBmcm9tLCB0bywgYXJncyk7IH0sXG4gICAgbGVhdmVBbnlTdGF0ZTogICBmdW5jdGlvbihmc20sIG5hbWUsIGZyb20sIHRvLCBhcmdzKSB7IHJldHVybiBTdGF0ZU1hY2hpbmUuZG9DYWxsYmFjayhmc20sIGZzbVsnb25sZWF2ZXN0YXRlJ10sICAgICAgICAgICAgICAgICAgICAgICAgbmFtZSwgZnJvbSwgdG8sIGFyZ3MpOyB9LFxuICAgIGVudGVyQW55U3RhdGU6ICAgZnVuY3Rpb24oZnNtLCBuYW1lLCBmcm9tLCB0bywgYXJncykgeyByZXR1cm4gU3RhdGVNYWNoaW5lLmRvQ2FsbGJhY2soZnNtLCBmc21bJ29uZW50ZXJzdGF0ZSddIHx8IGZzbVsnb25zdGF0ZSddLCAgICAgIG5hbWUsIGZyb20sIHRvLCBhcmdzKTsgfSxcbiAgICBjaGFuZ2VTdGF0ZTogICAgIGZ1bmN0aW9uKGZzbSwgbmFtZSwgZnJvbSwgdG8sIGFyZ3MpIHsgcmV0dXJuIFN0YXRlTWFjaGluZS5kb0NhbGxiYWNrKGZzbSwgZnNtWydvbmNoYW5nZXN0YXRlJ10sICAgICAgICAgICAgICAgICAgICAgICBuYW1lLCBmcm9tLCB0bywgYXJncyk7IH0sXG5cbiAgICBiZWZvcmVUaGlzRXZlbnQ6IGZ1bmN0aW9uKGZzbSwgbmFtZSwgZnJvbSwgdG8sIGFyZ3MpIHsgcmV0dXJuIFN0YXRlTWFjaGluZS5kb0NhbGxiYWNrKGZzbSwgZnNtWydvbmJlZm9yZScgKyBuYW1lXSwgICAgICAgICAgICAgICAgICAgICBuYW1lLCBmcm9tLCB0bywgYXJncyk7IH0sXG4gICAgYWZ0ZXJUaGlzRXZlbnQ6ICBmdW5jdGlvbihmc20sIG5hbWUsIGZyb20sIHRvLCBhcmdzKSB7IHJldHVybiBTdGF0ZU1hY2hpbmUuZG9DYWxsYmFjayhmc20sIGZzbVsnb25hZnRlcicgICsgbmFtZV0gfHwgZnNtWydvbicgKyBuYW1lXSwgbmFtZSwgZnJvbSwgdG8sIGFyZ3MpOyB9LFxuICAgIGxlYXZlVGhpc1N0YXRlOiAgZnVuY3Rpb24oZnNtLCBuYW1lLCBmcm9tLCB0bywgYXJncykgeyByZXR1cm4gU3RhdGVNYWNoaW5lLmRvQ2FsbGJhY2soZnNtLCBmc21bJ29ubGVhdmUnICArIGZyb21dLCAgICAgICAgICAgICAgICAgICAgIG5hbWUsIGZyb20sIHRvLCBhcmdzKTsgfSxcbiAgICBlbnRlclRoaXNTdGF0ZTogIGZ1bmN0aW9uKGZzbSwgbmFtZSwgZnJvbSwgdG8sIGFyZ3MpIHsgcmV0dXJuIFN0YXRlTWFjaGluZS5kb0NhbGxiYWNrKGZzbSwgZnNtWydvbmVudGVyJyAgKyB0b10gICB8fCBmc21bJ29uJyArIHRvXSwgICBuYW1lLCBmcm9tLCB0bywgYXJncyk7IH0sXG5cbiAgICBiZWZvcmVFdmVudDogZnVuY3Rpb24oZnNtLCBuYW1lLCBmcm9tLCB0bywgYXJncykge1xuICAgICAgaWYgKChmYWxzZSA9PT0gU3RhdGVNYWNoaW5lLmJlZm9yZVRoaXNFdmVudChmc20sIG5hbWUsIGZyb20sIHRvLCBhcmdzKSkgfHxcbiAgICAgICAgICAoZmFsc2UgPT09IFN0YXRlTWFjaGluZS5iZWZvcmVBbnlFdmVudCggZnNtLCBuYW1lLCBmcm9tLCB0bywgYXJncykpKVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfSxcblxuICAgIGFmdGVyRXZlbnQ6IGZ1bmN0aW9uKGZzbSwgbmFtZSwgZnJvbSwgdG8sIGFyZ3MpIHtcbiAgICAgIFN0YXRlTWFjaGluZS5hZnRlclRoaXNFdmVudChmc20sIG5hbWUsIGZyb20sIHRvLCBhcmdzKTtcbiAgICAgIFN0YXRlTWFjaGluZS5hZnRlckFueUV2ZW50KCBmc20sIG5hbWUsIGZyb20sIHRvLCBhcmdzKTtcbiAgICB9LFxuXG4gICAgbGVhdmVTdGF0ZTogZnVuY3Rpb24oZnNtLCBuYW1lLCBmcm9tLCB0bywgYXJncykge1xuICAgICAgdmFyIHNwZWNpZmljID0gU3RhdGVNYWNoaW5lLmxlYXZlVGhpc1N0YXRlKGZzbSwgbmFtZSwgZnJvbSwgdG8sIGFyZ3MpLFxuICAgICAgICAgIGdlbmVyYWwgID0gU3RhdGVNYWNoaW5lLmxlYXZlQW55U3RhdGUoIGZzbSwgbmFtZSwgZnJvbSwgdG8sIGFyZ3MpO1xuICAgICAgaWYgKChmYWxzZSA9PT0gc3BlY2lmaWMpIHx8IChmYWxzZSA9PT0gZ2VuZXJhbCkpXG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIGVsc2UgaWYgKChTdGF0ZU1hY2hpbmUuQVNZTkMgPT09IHNwZWNpZmljKSB8fCAoU3RhdGVNYWNoaW5lLkFTWU5DID09PSBnZW5lcmFsKSlcbiAgICAgICAgcmV0dXJuIFN0YXRlTWFjaGluZS5BU1lOQztcbiAgICB9LFxuXG4gICAgZW50ZXJTdGF0ZTogZnVuY3Rpb24oZnNtLCBuYW1lLCBmcm9tLCB0bywgYXJncykge1xuICAgICAgU3RhdGVNYWNoaW5lLmVudGVyVGhpc1N0YXRlKGZzbSwgbmFtZSwgZnJvbSwgdG8sIGFyZ3MpO1xuICAgICAgU3RhdGVNYWNoaW5lLmVudGVyQW55U3RhdGUoIGZzbSwgbmFtZSwgZnJvbSwgdG8sIGFyZ3MpO1xuICAgIH0sXG5cbiAgICAvLz09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4gICAgYnVpbGRFdmVudDogZnVuY3Rpb24obmFtZSwgbWFwKSB7XG4gICAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG5cbiAgICAgICAgdmFyIGZyb20gID0gdGhpcy5jdXJyZW50O1xuICAgICAgICB2YXIgdG8gICAgPSBtYXBbZnJvbV0gfHwgbWFwW1N0YXRlTWFjaGluZS5XSUxEQ0FSRF0gfHwgZnJvbTtcbiAgICAgICAgdmFyIGFyZ3MgID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKTsgLy8gdHVybiBhcmd1bWVudHMgaW50byBwdXJlIGFycmF5XG5cbiAgICAgICAgaWYgKHRoaXMudHJhbnNpdGlvbilcbiAgICAgICAgICByZXR1cm4gdGhpcy5lcnJvcihuYW1lLCBmcm9tLCB0bywgYXJncywgU3RhdGVNYWNoaW5lLkVycm9yLlBFTkRJTkdfVFJBTlNJVElPTiwgXCJldmVudCBcIiArIG5hbWUgKyBcIiBpbmFwcHJvcHJpYXRlIGJlY2F1c2UgcHJldmlvdXMgdHJhbnNpdGlvbiBkaWQgbm90IGNvbXBsZXRlXCIpO1xuXG4gICAgICAgIGlmICh0aGlzLmNhbm5vdChuYW1lKSlcbiAgICAgICAgICByZXR1cm4gdGhpcy5lcnJvcihuYW1lLCBmcm9tLCB0bywgYXJncywgU3RhdGVNYWNoaW5lLkVycm9yLklOVkFMSURfVFJBTlNJVElPTiwgXCJldmVudCBcIiArIG5hbWUgKyBcIiBpbmFwcHJvcHJpYXRlIGluIGN1cnJlbnQgc3RhdGUgXCIgKyB0aGlzLmN1cnJlbnQpO1xuXG4gICAgICAgIGlmIChmYWxzZSA9PT0gU3RhdGVNYWNoaW5lLmJlZm9yZUV2ZW50KHRoaXMsIG5hbWUsIGZyb20sIHRvLCBhcmdzKSlcbiAgICAgICAgICByZXR1cm4gU3RhdGVNYWNoaW5lLlJlc3VsdC5DQU5DRUxMRUQ7XG5cbiAgICAgICAgaWYgKGZyb20gPT09IHRvKSB7XG4gICAgICAgICAgU3RhdGVNYWNoaW5lLmFmdGVyRXZlbnQodGhpcywgbmFtZSwgZnJvbSwgdG8sIGFyZ3MpO1xuICAgICAgICAgIHJldHVybiBTdGF0ZU1hY2hpbmUuUmVzdWx0Lk5PVFJBTlNJVElPTjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHByZXBhcmUgYSB0cmFuc2l0aW9uIG1ldGhvZCBmb3IgdXNlIEVJVEhFUiBsb3dlciBkb3duLCBvciBieSBjYWxsZXIgaWYgdGhleSB3YW50IGFuIGFzeW5jIHRyYW5zaXRpb24gKGluZGljYXRlZCBieSBhbiBBU1lOQyByZXR1cm4gdmFsdWUgZnJvbSBsZWF2ZVN0YXRlKVxuICAgICAgICB2YXIgZnNtID0gdGhpcztcbiAgICAgICAgdGhpcy50cmFuc2l0aW9uID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgZnNtLnRyYW5zaXRpb24gPSBudWxsOyAvLyB0aGlzIG1ldGhvZCBzaG91bGQgb25seSBldmVyIGJlIGNhbGxlZCBvbmNlXG4gICAgICAgICAgZnNtLmN1cnJlbnQgPSB0bztcbiAgICAgICAgICBTdGF0ZU1hY2hpbmUuZW50ZXJTdGF0ZSggZnNtLCBuYW1lLCBmcm9tLCB0bywgYXJncyk7XG4gICAgICAgICAgU3RhdGVNYWNoaW5lLmNoYW5nZVN0YXRlKGZzbSwgbmFtZSwgZnJvbSwgdG8sIGFyZ3MpO1xuICAgICAgICAgIFN0YXRlTWFjaGluZS5hZnRlckV2ZW50KCBmc20sIG5hbWUsIGZyb20sIHRvLCBhcmdzKTtcbiAgICAgICAgICByZXR1cm4gU3RhdGVNYWNoaW5lLlJlc3VsdC5TVUNDRUVERUQ7XG4gICAgICAgIH07XG4gICAgICAgIHRoaXMudHJhbnNpdGlvbi5jYW5jZWwgPSBmdW5jdGlvbigpIHsgLy8gcHJvdmlkZSBhIHdheSBmb3IgY2FsbGVyIHRvIGNhbmNlbCBhc3luYyB0cmFuc2l0aW9uIGlmIGRlc2lyZWQgKGlzc3VlICMyMilcbiAgICAgICAgICBmc20udHJhbnNpdGlvbiA9IG51bGw7XG4gICAgICAgICAgU3RhdGVNYWNoaW5lLmFmdGVyRXZlbnQoZnNtLCBuYW1lLCBmcm9tLCB0bywgYXJncyk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgbGVhdmUgPSBTdGF0ZU1hY2hpbmUubGVhdmVTdGF0ZSh0aGlzLCBuYW1lLCBmcm9tLCB0bywgYXJncyk7XG4gICAgICAgIGlmIChmYWxzZSA9PT0gbGVhdmUpIHtcbiAgICAgICAgICB0aGlzLnRyYW5zaXRpb24gPSBudWxsO1xuICAgICAgICAgIHJldHVybiBTdGF0ZU1hY2hpbmUuUmVzdWx0LkNBTkNFTExFRDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChTdGF0ZU1hY2hpbmUuQVNZTkMgPT09IGxlYXZlKSB7XG4gICAgICAgICAgcmV0dXJuIFN0YXRlTWFjaGluZS5SZXN1bHQuUEVORElORztcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICBpZiAodGhpcy50cmFuc2l0aW9uKSAvLyBuZWVkIHRvIGNoZWNrIGluIGNhc2UgdXNlciBtYW51YWxseSBjYWxsZWQgdHJhbnNpdGlvbigpIGJ1dCBmb3Jnb3QgdG8gcmV0dXJuIFN0YXRlTWFjaGluZS5BU1lOQ1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMudHJhbnNpdGlvbigpO1xuICAgICAgICB9XG5cbiAgICAgIH07XG4gICAgfVxuXG4gIH07IC8vIFN0YXRlTWFjaGluZVxuXG4gIC8vPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbiAgLy89PT09PT1cbiAgLy8gTk9ERVxuICAvLz09PT09PVxuICBpZiAodHlwZW9mIGV4cG9ydHMgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgaWYgKHR5cGVvZiBtb2R1bGUgIT09ICd1bmRlZmluZWQnICYmIG1vZHVsZS5leHBvcnRzKSB7XG4gICAgICBleHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSBTdGF0ZU1hY2hpbmU7XG4gICAgfVxuICAgIGV4cG9ydHMuU3RhdGVNYWNoaW5lID0gU3RhdGVNYWNoaW5lO1xuICB9XG4gIC8vPT09PT09PT09PT09XG4gIC8vIEFNRC9SRVFVSVJFXG4gIC8vPT09PT09PT09PT09XG4gIGVsc2UgaWYgKHR5cGVvZiBkZWZpbmUgPT09ICdmdW5jdGlvbicgJiYgZGVmaW5lLmFtZCkge1xuICAgIGRlZmluZShmdW5jdGlvbihyZXF1aXJlKSB7IHJldHVybiBTdGF0ZU1hY2hpbmU7IH0pO1xuICB9XG4gIC8vPT09PT09PT1cbiAgLy8gQlJPV1NFUlxuICAvLz09PT09PT09XG4gIGVsc2UgaWYgKHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgd2luZG93LlN0YXRlTWFjaGluZSA9IFN0YXRlTWFjaGluZTtcbiAgfVxuICAvLz09PT09PT09PT09XG4gIC8vIFdFQiBXT1JLRVJcbiAgLy89PT09PT09PT09PVxuICBlbHNlIGlmICh0eXBlb2Ygc2VsZiAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICBzZWxmLlN0YXRlTWFjaGluZSA9IFN0YXRlTWFjaGluZTtcbiAgfVxuXG59KCkpO1xuIiwiLypcclxuKiBsb2dsZXZlbCAtIGh0dHBzOi8vZ2l0aHViLmNvbS9waW10ZXJyeS9sb2dsZXZlbFxyXG4qXHJcbiogQ29weXJpZ2h0IChjKSAyMDEzIFRpbSBQZXJyeVxyXG4qIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgbGljZW5zZS5cclxuKi9cclxuKGZ1bmN0aW9uIChyb290LCBkZWZpbml0aW9uKSB7XHJcbiAgICBcInVzZSBzdHJpY3RcIjtcclxuICAgIGlmICh0eXBlb2YgbW9kdWxlID09PSAnb2JqZWN0JyAmJiBtb2R1bGUuZXhwb3J0cyAmJiB0eXBlb2YgcmVxdWlyZSA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgIG1vZHVsZS5leHBvcnRzID0gZGVmaW5pdGlvbigpO1xyXG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZGVmaW5lID09PSAnZnVuY3Rpb24nICYmIHR5cGVvZiBkZWZpbmUuYW1kID09PSAnb2JqZWN0Jykge1xyXG4gICAgICAgIGRlZmluZShkZWZpbml0aW9uKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgcm9vdC5sb2cgPSBkZWZpbml0aW9uKCk7XHJcbiAgICB9XHJcbn0odGhpcywgZnVuY3Rpb24gKCkge1xyXG4gICAgXCJ1c2Ugc3RyaWN0XCI7XHJcbiAgICB2YXIgbm9vcCA9IGZ1bmN0aW9uKCkge307XHJcbiAgICB2YXIgdW5kZWZpbmVkVHlwZSA9IFwidW5kZWZpbmVkXCI7XHJcblxyXG4gICAgZnVuY3Rpb24gcmVhbE1ldGhvZChtZXRob2ROYW1lKSB7XHJcbiAgICAgICAgaWYgKHR5cGVvZiBjb25zb2xlID09PSB1bmRlZmluZWRUeXBlKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTsgLy8gV2UgY2FuJ3QgYnVpbGQgYSByZWFsIG1ldGhvZCB3aXRob3V0IGEgY29uc29sZSB0byBsb2cgdG9cclxuICAgICAgICB9IGVsc2UgaWYgKGNvbnNvbGVbbWV0aG9kTmFtZV0gIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICByZXR1cm4gYmluZE1ldGhvZChjb25zb2xlLCBtZXRob2ROYW1lKTtcclxuICAgICAgICB9IGVsc2UgaWYgKGNvbnNvbGUubG9nICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgcmV0dXJuIGJpbmRNZXRob2QoY29uc29sZSwgJ2xvZycpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHJldHVybiBub29wO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBiaW5kTWV0aG9kKG9iaiwgbWV0aG9kTmFtZSkge1xyXG4gICAgICAgIHZhciBtZXRob2QgPSBvYmpbbWV0aG9kTmFtZV07XHJcbiAgICAgICAgaWYgKHR5cGVvZiBtZXRob2QuYmluZCA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgICAgICByZXR1cm4gbWV0aG9kLmJpbmQob2JqKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIEZ1bmN0aW9uLnByb3RvdHlwZS5iaW5kLmNhbGwobWV0aG9kLCBvYmopO1xyXG4gICAgICAgICAgICB9IGNhdGNoIChlKSB7XHJcbiAgICAgICAgICAgICAgICAvLyBNaXNzaW5nIGJpbmQgc2hpbSBvciBJRTggKyBNb2Rlcm5penIsIGZhbGxiYWNrIHRvIHdyYXBwaW5nXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIEZ1bmN0aW9uLnByb3RvdHlwZS5hcHBseS5hcHBseShtZXRob2QsIFtvYmosIGFyZ3VtZW50c10pO1xyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyB0aGVzZSBwcml2YXRlIGZ1bmN0aW9ucyBhbHdheXMgbmVlZCBgdGhpc2AgdG8gYmUgc2V0IHByb3Blcmx5XHJcblxyXG4gICAgZnVuY3Rpb24gZW5hYmxlTG9nZ2luZ1doZW5Db25zb2xlQXJyaXZlcyhtZXRob2ROYW1lLCBsZXZlbCwgbG9nZ2VyTmFtZSkge1xyXG4gICAgICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgIGlmICh0eXBlb2YgY29uc29sZSAhPT0gdW5kZWZpbmVkVHlwZSkge1xyXG4gICAgICAgICAgICAgICAgcmVwbGFjZUxvZ2dpbmdNZXRob2RzLmNhbGwodGhpcywgbGV2ZWwsIGxvZ2dlck5hbWUpO1xyXG4gICAgICAgICAgICAgICAgdGhpc1ttZXRob2ROYW1lXS5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfTtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiByZXBsYWNlTG9nZ2luZ01ldGhvZHMobGV2ZWwsIGxvZ2dlck5hbWUpIHtcclxuICAgICAgICAvKmpzaGludCB2YWxpZHRoaXM6dHJ1ZSAqL1xyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbG9nTWV0aG9kcy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICB2YXIgbWV0aG9kTmFtZSA9IGxvZ01ldGhvZHNbaV07XHJcbiAgICAgICAgICAgIHRoaXNbbWV0aG9kTmFtZV0gPSAoaSA8IGxldmVsKSA/XHJcbiAgICAgICAgICAgICAgICBub29wIDpcclxuICAgICAgICAgICAgICAgIHRoaXMubWV0aG9kRmFjdG9yeShtZXRob2ROYW1lLCBsZXZlbCwgbG9nZ2VyTmFtZSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGRlZmF1bHRNZXRob2RGYWN0b3J5KG1ldGhvZE5hbWUsIGxldmVsLCBsb2dnZXJOYW1lKSB7XHJcbiAgICAgICAgLypqc2hpbnQgdmFsaWR0aGlzOnRydWUgKi9cclxuICAgICAgICByZXR1cm4gcmVhbE1ldGhvZChtZXRob2ROYW1lKSB8fFxyXG4gICAgICAgICAgICAgICBlbmFibGVMb2dnaW5nV2hlbkNvbnNvbGVBcnJpdmVzLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XHJcbiAgICB9XHJcblxyXG4gICAgdmFyIGxvZ01ldGhvZHMgPSBbXHJcbiAgICAgICAgXCJ0cmFjZVwiLFxyXG4gICAgICAgIFwiZGVidWdcIixcclxuICAgICAgICBcImluZm9cIixcclxuICAgICAgICBcIndhcm5cIixcclxuICAgICAgICBcImVycm9yXCJcclxuICAgIF07XHJcblxyXG4gICAgZnVuY3Rpb24gTG9nZ2VyKG5hbWUsIGRlZmF1bHRMZXZlbCwgZmFjdG9yeSkge1xyXG4gICAgICB2YXIgc2VsZiA9IHRoaXM7XHJcbiAgICAgIHZhciBjdXJyZW50TGV2ZWw7XHJcbiAgICAgIHZhciBzdG9yYWdlS2V5ID0gXCJsb2dsZXZlbFwiO1xyXG4gICAgICBpZiAobmFtZSkge1xyXG4gICAgICAgIHN0b3JhZ2VLZXkgKz0gXCI6XCIgKyBuYW1lO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBmdW5jdGlvbiBwZXJzaXN0TGV2ZWxJZlBvc3NpYmxlKGxldmVsTnVtKSB7XHJcbiAgICAgICAgICB2YXIgbGV2ZWxOYW1lID0gKGxvZ01ldGhvZHNbbGV2ZWxOdW1dIHx8ICdzaWxlbnQnKS50b1VwcGVyQ2FzZSgpO1xyXG5cclxuICAgICAgICAgIC8vIFVzZSBsb2NhbFN0b3JhZ2UgaWYgYXZhaWxhYmxlXHJcbiAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgIHdpbmRvdy5sb2NhbFN0b3JhZ2Vbc3RvcmFnZUtleV0gPSBsZXZlbE5hbWU7XHJcbiAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgfSBjYXRjaCAoaWdub3JlKSB7fVxyXG5cclxuICAgICAgICAgIC8vIFVzZSBzZXNzaW9uIGNvb2tpZSBhcyBmYWxsYmFja1xyXG4gICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICB3aW5kb3cuZG9jdW1lbnQuY29va2llID1cclxuICAgICAgICAgICAgICAgIGVuY29kZVVSSUNvbXBvbmVudChzdG9yYWdlS2V5KSArIFwiPVwiICsgbGV2ZWxOYW1lICsgXCI7XCI7XHJcbiAgICAgICAgICB9IGNhdGNoIChpZ25vcmUpIHt9XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGZ1bmN0aW9uIGdldFBlcnNpc3RlZExldmVsKCkge1xyXG4gICAgICAgICAgdmFyIHN0b3JlZExldmVsO1xyXG5cclxuICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgc3RvcmVkTGV2ZWwgPSB3aW5kb3cubG9jYWxTdG9yYWdlW3N0b3JhZ2VLZXldO1xyXG4gICAgICAgICAgfSBjYXRjaCAoaWdub3JlKSB7fVxyXG5cclxuICAgICAgICAgIGlmICh0eXBlb2Ygc3RvcmVkTGV2ZWwgPT09IHVuZGVmaW5lZFR5cGUpIHtcclxuICAgICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgICB2YXIgY29va2llID0gd2luZG93LmRvY3VtZW50LmNvb2tpZTtcclxuICAgICAgICAgICAgICAgICAgdmFyIGxvY2F0aW9uID0gY29va2llLmluZGV4T2YoXHJcbiAgICAgICAgICAgICAgICAgICAgICBlbmNvZGVVUklDb21wb25lbnQoc3RvcmFnZUtleSkgKyBcIj1cIik7XHJcbiAgICAgICAgICAgICAgICAgIGlmIChsb2NhdGlvbikge1xyXG4gICAgICAgICAgICAgICAgICAgICAgc3RvcmVkTGV2ZWwgPSAvXihbXjtdKykvLmV4ZWMoY29va2llLnNsaWNlKGxvY2F0aW9uKSlbMV07XHJcbiAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICB9IGNhdGNoIChpZ25vcmUpIHt9XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgLy8gSWYgdGhlIHN0b3JlZCBsZXZlbCBpcyBub3QgdmFsaWQsIHRyZWF0IGl0IGFzIGlmIG5vdGhpbmcgd2FzIHN0b3JlZC5cclxuICAgICAgICAgIGlmIChzZWxmLmxldmVsc1tzdG9yZWRMZXZlbF0gPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICAgIHN0b3JlZExldmVsID0gdW5kZWZpbmVkO1xyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIHJldHVybiBzdG9yZWRMZXZlbDtcclxuICAgICAgfVxyXG5cclxuICAgICAgLypcclxuICAgICAgICpcclxuICAgICAgICogUHVibGljIEFQSVxyXG4gICAgICAgKlxyXG4gICAgICAgKi9cclxuXHJcbiAgICAgIHNlbGYubGV2ZWxzID0geyBcIlRSQUNFXCI6IDAsIFwiREVCVUdcIjogMSwgXCJJTkZPXCI6IDIsIFwiV0FSTlwiOiAzLFxyXG4gICAgICAgICAgXCJFUlJPUlwiOiA0LCBcIlNJTEVOVFwiOiA1fTtcclxuXHJcbiAgICAgIHNlbGYubWV0aG9kRmFjdG9yeSA9IGZhY3RvcnkgfHwgZGVmYXVsdE1ldGhvZEZhY3Rvcnk7XHJcblxyXG4gICAgICBzZWxmLmdldExldmVsID0gZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgcmV0dXJuIGN1cnJlbnRMZXZlbDtcclxuICAgICAgfTtcclxuXHJcbiAgICAgIHNlbGYuc2V0TGV2ZWwgPSBmdW5jdGlvbiAobGV2ZWwsIHBlcnNpc3QpIHtcclxuICAgICAgICAgIGlmICh0eXBlb2YgbGV2ZWwgPT09IFwic3RyaW5nXCIgJiYgc2VsZi5sZXZlbHNbbGV2ZWwudG9VcHBlckNhc2UoKV0gIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICAgIGxldmVsID0gc2VsZi5sZXZlbHNbbGV2ZWwudG9VcHBlckNhc2UoKV07XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBpZiAodHlwZW9mIGxldmVsID09PSBcIm51bWJlclwiICYmIGxldmVsID49IDAgJiYgbGV2ZWwgPD0gc2VsZi5sZXZlbHMuU0lMRU5UKSB7XHJcbiAgICAgICAgICAgICAgY3VycmVudExldmVsID0gbGV2ZWw7XHJcbiAgICAgICAgICAgICAgaWYgKHBlcnNpc3QgIT09IGZhbHNlKSB7ICAvLyBkZWZhdWx0cyB0byB0cnVlXHJcbiAgICAgICAgICAgICAgICAgIHBlcnNpc3RMZXZlbElmUG9zc2libGUobGV2ZWwpO1xyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICByZXBsYWNlTG9nZ2luZ01ldGhvZHMuY2FsbChzZWxmLCBsZXZlbCwgbmFtZSk7XHJcbiAgICAgICAgICAgICAgaWYgKHR5cGVvZiBjb25zb2xlID09PSB1bmRlZmluZWRUeXBlICYmIGxldmVsIDwgc2VsZi5sZXZlbHMuU0lMRU5UKSB7XHJcbiAgICAgICAgICAgICAgICAgIHJldHVybiBcIk5vIGNvbnNvbGUgYXZhaWxhYmxlIGZvciBsb2dnaW5nXCI7XHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICB0aHJvdyBcImxvZy5zZXRMZXZlbCgpIGNhbGxlZCB3aXRoIGludmFsaWQgbGV2ZWw6IFwiICsgbGV2ZWw7XHJcbiAgICAgICAgICB9XHJcbiAgICAgIH07XHJcblxyXG4gICAgICBzZWxmLnNldERlZmF1bHRMZXZlbCA9IGZ1bmN0aW9uIChsZXZlbCkge1xyXG4gICAgICAgICAgaWYgKCFnZXRQZXJzaXN0ZWRMZXZlbCgpKSB7XHJcbiAgICAgICAgICAgICAgc2VsZi5zZXRMZXZlbChsZXZlbCwgZmFsc2UpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICB9O1xyXG5cclxuICAgICAgc2VsZi5lbmFibGVBbGwgPSBmdW5jdGlvbihwZXJzaXN0KSB7XHJcbiAgICAgICAgICBzZWxmLnNldExldmVsKHNlbGYubGV2ZWxzLlRSQUNFLCBwZXJzaXN0KTtcclxuICAgICAgfTtcclxuXHJcbiAgICAgIHNlbGYuZGlzYWJsZUFsbCA9IGZ1bmN0aW9uKHBlcnNpc3QpIHtcclxuICAgICAgICAgIHNlbGYuc2V0TGV2ZWwoc2VsZi5sZXZlbHMuU0lMRU5ULCBwZXJzaXN0KTtcclxuICAgICAgfTtcclxuXHJcbiAgICAgIC8vIEluaXRpYWxpemUgd2l0aCB0aGUgcmlnaHQgbGV2ZWxcclxuICAgICAgdmFyIGluaXRpYWxMZXZlbCA9IGdldFBlcnNpc3RlZExldmVsKCk7XHJcbiAgICAgIGlmIChpbml0aWFsTGV2ZWwgPT0gbnVsbCkge1xyXG4gICAgICAgICAgaW5pdGlhbExldmVsID0gZGVmYXVsdExldmVsID09IG51bGwgPyBcIldBUk5cIiA6IGRlZmF1bHRMZXZlbDtcclxuICAgICAgfVxyXG4gICAgICBzZWxmLnNldExldmVsKGluaXRpYWxMZXZlbCwgZmFsc2UpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qXHJcbiAgICAgKlxyXG4gICAgICogUGFja2FnZS1sZXZlbCBBUElcclxuICAgICAqXHJcbiAgICAgKi9cclxuXHJcbiAgICB2YXIgZGVmYXVsdExvZ2dlciA9IG5ldyBMb2dnZXIoKTtcclxuXHJcbiAgICB2YXIgX2xvZ2dlcnNCeU5hbWUgPSB7fTtcclxuICAgIGRlZmF1bHRMb2dnZXIuZ2V0TG9nZ2VyID0gZnVuY3Rpb24gZ2V0TG9nZ2VyKG5hbWUpIHtcclxuICAgICAgICBpZiAodHlwZW9mIG5hbWUgIT09IFwic3RyaW5nXCIgfHwgbmFtZSA9PT0gXCJcIikge1xyXG4gICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcIllvdSBtdXN0IHN1cHBseSBhIG5hbWUgd2hlbiBjcmVhdGluZyBhIGxvZ2dlci5cIik7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB2YXIgbG9nZ2VyID0gX2xvZ2dlcnNCeU5hbWVbbmFtZV07XHJcbiAgICAgICAgaWYgKCFsb2dnZXIpIHtcclxuICAgICAgICAgIGxvZ2dlciA9IF9sb2dnZXJzQnlOYW1lW25hbWVdID0gbmV3IExvZ2dlcihcclxuICAgICAgICAgICAgbmFtZSwgZGVmYXVsdExvZ2dlci5nZXRMZXZlbCgpLCBkZWZhdWx0TG9nZ2VyLm1ldGhvZEZhY3RvcnkpO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gbG9nZ2VyO1xyXG4gICAgfTtcclxuXHJcbiAgICAvLyBHcmFiIHRoZSBjdXJyZW50IGdsb2JhbCBsb2cgdmFyaWFibGUgaW4gY2FzZSBvZiBvdmVyd3JpdGVcclxuICAgIHZhciBfbG9nID0gKHR5cGVvZiB3aW5kb3cgIT09IHVuZGVmaW5lZFR5cGUpID8gd2luZG93LmxvZyA6IHVuZGVmaW5lZDtcclxuICAgIGRlZmF1bHRMb2dnZXIubm9Db25mbGljdCA9IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIGlmICh0eXBlb2Ygd2luZG93ICE9PSB1bmRlZmluZWRUeXBlICYmXHJcbiAgICAgICAgICAgICAgIHdpbmRvdy5sb2cgPT09IGRlZmF1bHRMb2dnZXIpIHtcclxuICAgICAgICAgICAgd2luZG93LmxvZyA9IF9sb2c7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gZGVmYXVsdExvZ2dlcjtcclxuICAgIH07XHJcblxyXG4gICAgcmV0dXJuIGRlZmF1bHRMb2dnZXI7XHJcbn0pKTtcclxuIiwibGV0ICQgPSAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvd1snJCddIDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbFsnJCddIDogbnVsbCk7XHJcbmxldCBfID0gKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3dbJ18nXSA6IHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWxbJ18nXSA6IG51bGwpO1xyXG5cclxubGV0IGNvbnN0YW50cyA9IHJlcXVpcmUoJy4vY29uc3QuanMnKTtcclxubGV0IFBsdW5kZXJhYmxlVmlsbGFnZSA9IHJlcXVpcmUoXCIuL2RhdGEvcGx1bmRlcmFibGUtdmlsbGFnZVwiKTtcclxubGV0IEJvdE9yZGVyID0gcmVxdWlyZShcIi4vZGF0YS9ib3Qtb3JkZXIuanNcIik7XHJcbmxldCBtaW5lciA9IHJlcXVpcmUoXCIuL21pbmVyXCIpO1xyXG5sZXQgdXRpbCA9IHJlcXVpcmUoXCIuL3V0aWxcIik7XHJcbmxldCBzZXR0aW5ncyA9IHJlcXVpcmUoXCIuL3NldHRpbmdzXCIpO1xyXG5cclxuZnVuY3Rpb24gaGFzRW5vdWd0aFVuaXRzICh1bml0cykge1xyXG4gIFwidXNlIHN0cmljdDtcIlxyXG4gICAgXHJcbiAgbGV0IGN1cnJlbnRfdW5pdHMgPSBtaW5lci5taW5lQ3VycmVudFVuaXRzKCk7XHJcbiAgXHJcbiAgZm9yIChsZXQgdW5pdF9uYW1lIGluIHVuaXRzKSB7XHJcbiAgICBpZihjdXJyZW50X3VuaXRzW3VuaXRfbmFtZV0gPCB1bml0c1t1bml0X25hbWVdKSB7XHJcbiAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuICB9XHJcbiAgXHJcbiAgcmV0dXJuIHRydWU7XHJcbn1cclxuXHJcblxyXG5leHBvcnRzLmNyZWF0ZU9yZGVycyA9IGZ1bmN0aW9uIChwbHVuZGVyYWJsZV92aWxsYWdlcykge1xyXG4gIFwidXNlIHN0cmljdDtcIlxyXG4gIFxyXG4gIGxldCBvcmRlcnMgPSBbXTtcclxuICBsZXQgYm90X3NldHRpbmdzID0gc2V0dGluZ3MuQm90U2V0dGluZ3M7XHJcbiAgXHJcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBwbHVuZGVyYWJsZV92aWxsYWdlcy5sZW5ndGg7IGkrKykge1xyXG4gICAgbGV0IHB2ID0gcGx1bmRlcmFibGVfdmlsbGFnZXNbaV07XHJcbiAgICBcclxuICAgIGlmKCFwdi5pc19hdHRhY2tpbmcpIHtcclxuICAgICAgLyogTm90IGFscmVhZHkgYXR0YWNraW5nICovXHJcbiAgICAgICAgICAgIFxyXG4gICAgICBpZihwdi53YWxsID4gMCkgeyAvKiBIYXMgV2FsbCAqL1xyXG4gICAgICAgIC8vIFNlbmQgYSBoaWdoIHByaW9yaXR5IGF0dGFjayB3aXRoIDEwIGxpZ3RoIGNhdiwgMSBzcHksIGFuZCBuIHJhbXNcclxuICAgICAgICBsZXQgdW5pdHMgPSBfLmNsb25lKGJvdF9zZXR0aW5ncy5SQU1fVU5JVFMpO1xyXG4gICAgICAgIHVuaXRzLnJhbSA9IGJvdF9zZXR0aW5ncy5SQU1TX1BFUl9XQUxMX0xFVkVMW3B2LndhbGxdOyBcclxuICAgICAgICBvcmRlcnMucHVzaChuZXcgQm90T3JkZXIuQ3VzdG9tT3JkZXIocHYsIHVuaXRzLCAtMTAwKSk7XHJcbiAgICAgICAgXHJcbiAgICAgIH0gZWxzZSBpZihwdi5nZXRUb3RhbFJlcygpID49IGJvdF9zZXR0aW5ncy5NSU5fUkVTKSB7XHJcbiAgICAgICAgLyogRG9lc24ndCBoYXZlIHdhbGxzICYmIEhhcyByZXNvdXJjZXMgKi9cclxuICAgICAgICBcclxuICAgICAgICBpZiAocHYuZGlzdGFuY2UgPD0gYm90X3NldHRpbmdzLk1BWF9ESVNUKSB7XHJcbiAgICAgICAgICBpZihwdi5nZXRUb3RhbFJlcygpID49IGJvdF9zZXR0aW5ncy5NQVhfUkVTKSB7XHJcbiAgICAgICAgICAgIG9yZGVycy5wdXNoKG5ldyBCb3RPcmRlci5UZW1wbGF0ZU9yZGVyKHB2LCBib3Rfc2V0dGluZ3MuTUFYX1RFTVBMQVRFLCAwKSk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgb3JkZXJzLnB1c2gobmV3IEJvdE9yZGVyLlRlbXBsYXRlT3JkZXIocHYsIFwiQ1wiLCAwKSk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICB9IFxyXG4gICAgfVxyXG4gIH1cclxuICAgIFxyXG4gIHJldHVybiBvcmRlcnM7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHJ1bkZuc0V2ZXJ5SW50ZXJ2YWwgKG9yZGVycywgbXMpIHtcclxuICBcInVzZSBzdHJpY3RcIjtcclxuICBcclxuICBjb25zdCBPUkRFUlNfRVhFQ1VUSU9OX01JTl9JTlRFUlZBTCA9IDI1MDtcclxuICBjb25zdCBPUkRFUlNfRVhFQ1VUSU9OX01BWF9JTlRFUlZBTCA9IDYwMDAwO1xyXG4gIFxyXG4gIG1zID0gTWF0aC5taW4oTWF0aC5tYXgobXMsIE9SREVSU19FWEVDVVRJT05fTUlOX0lOVEVSVkFMKSwgT1JERVJTX0VYRUNVVElPTl9NQVhfSU5URVJWQUwpO1xyXG4gIFxyXG4gIGxldCBvcmRlcnNfZm5zID0gXy5tYXAob3JkZXJzLCBvID0+IF8uYmluZChvLmV4ZWN1dGUsIG8pKTtcclxuICB1dGlsLm1heWJlUnVuRm5zKG9yZGVyc19mbnMsIDEsIG1zKTsgICAgXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGRlbGF5KGludGVydmFsKSB7XHJcbiAgICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSkge1xyXG4gICAgICAgIHNldFRpbWVvdXQocmVzb2x2ZSwgaW50ZXJ2YWwpO1xyXG4gICAgfSk7XHJcbn1cclxuXHJcbmV4cG9ydHMuZXhlY3V0ZSA9IGZ1bmN0aW9uICgpIHtcclxuICBcInVzZSBzdHJpY3RcIjtcclxuICAgIFxyXG4gIC8vIEdhdGhlciB2aWxsYWdlcyBpbmZvXHJcbiAgbGV0IHBsdW5kZXJhYmxlX3ZpbGxhZ2VzID0gbWluZXIubWluZVBsdW5kZXJWaWxsYWdlcygpO1xyXG4gIFxyXG4gIC8vIENyZWF0ZSBvcmRlcnNcclxuICBsZXQgb3JkZXJzID0gZXhwb3J0cy5jcmVhdGVPcmRlcnMocGx1bmRlcmFibGVfdmlsbGFnZXMpO1xyXG4gIG9yZGVycyA9IF8uc29ydEJ5QWxsKG9yZGVycywgJ3ByaW9yaXR5Jyk7IC8vIFNvcnQgYnkgaGlnaGVyIHByaW9yaXR5XHJcbiAgXHJcbiAgLyogRXhlY3V0ZSBvcmRlcnMgKi9cclxuICBsZXQgcHJvZ3Jlc3NfYmFyID0gJChcIiNUV0ZBUC1wcm9ncmVzcy1leGVjdXRpb25cIik7XHJcbiAgbGV0IGV4ZWN1dGVfcHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSgpO1xyXG4gIFxyXG4gIC8vIENsZWFyIHByb2dyZXNzYmFyXHJcbiAgcHJvZ3Jlc3NfYmFyLmF0dHIoXCJtYXhcIiwgb3JkZXJzLmxlbmd0aCk7XHJcbiAgcHJvZ3Jlc3NfYmFyLnZhbCgwKTtcclxuICBcclxuICAvLyBDcmVhdGUgcHJvbWlzZVxyXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgb3JkZXJzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICBsZXQgb3JkZXIgPSBvcmRlcnNbaV07XHJcbiAgICBcclxuICAgIGV4ZWN1dGVfcHJvbWlzZSA9IGV4ZWN1dGVfcHJvbWlzZS50aGVuKCgpID0+IHtcclxuICAgICAgcHJvZ3Jlc3NfYmFyLnZhbChwcm9ncmVzc19iYXIudmFsKCkgKyAxKTtcclxuICAgICAgcmV0dXJuIG9yZGVyLmV4ZWN1dGUoKSA/IGRlbGF5KDUwMCkgOiBudWxsO1xyXG4gICAgfSk7XHJcbiAgfVxyXG4gIFxyXG4gIGV4ZWN1dGVfcHJvbWlzZSA9IGV4ZWN1dGVfcHJvbWlzZS5jYXRjaChjb25zb2xlLmVycm9yLmJpbmQoY29uc29sZSkpO1xyXG4gIFxyXG4gIHJldHVybiBleGVjdXRlX3Byb21pc2U7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNsZWFyU2ltdWxhdGlvbigpIHtcclxuICBcInVzZSBzdHJpY3RcIjtcclxuICBcclxuICAkKFwiLlwiICsgY29uc3RhbnRzLlNJTVVMQVRJT05fQlROX0NMQVNTKVxyXG4gICAgLmVhY2goKGksIGUpID0+ICQoZSkucmVtb3ZlQ2xhc3MoY29uc3RhbnRzLlNJTVVMQVRJT05fQlROX0NMQVNTKSk7XHJcbn1cclxuZXhwb3J0cy5jbGVhclNpbXVsYXRpb24gPSBjbGVhclNpbXVsYXRpb247XHJcblxyXG5leHBvcnRzLnNpbXVsYXRlID0gZnVuY3Rpb24gKCkge1xyXG4gIFwidXNlIHN0cmljdFwiO1xyXG4gIFxyXG4gIC8vIFJlbW92ZSBwcmV2aW91cyBzaW11bGF0aW9uXHJcbiAgY2xlYXJTaW11bGF0aW9uKCk7XHJcbiAgICBcclxuICAvLyBHYXRoZXIgdmlsbGFnZXMgaW5mb1xyXG4gIGxldCBwbHVuZGVyYWJsZV92aWxsYWdlcyA9IG1pbmVyLm1pbmVQbHVuZGVyVmlsbGFnZXMoKTtcclxuICBcclxuICAvLyBDcmVhdGUgb3JkZXJzXHJcbiAgbGV0IG9yZGVycyA9IGV4cG9ydHMuY3JlYXRlT3JkZXJzKHBsdW5kZXJhYmxlX3ZpbGxhZ2VzKTtcclxuICBvcmRlcnMgPSBfLnNvcnRCeUFsbChvcmRlcnMsICdwcmlvcml0eScpOyAvLyBTb3J0IGJ5IGhpZ2hlciBwcmlvcml0eVxyXG4gIFxyXG4gIC8vIERyYXcgc2ltdWxhdGlvblxyXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgb3JkZXJzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICBvcmRlcnNbaV0uc2ltdWxhdGUoKTtcclxuICB9XHJcbn0iLCJtb2R1bGUuZXhwb3J0cyA9IHtcclxuICAvKioqIFNldHRpbmdzICoqKi9cclxuICBERUZBVUxUX1NFVFRJTkdTIDoge1xyXG4gICAgLy8gRGVmYXVsdHNcclxuICAgIEJvdFNldHRpbmdzIDoge1xyXG4gICAgICBNSU5fUkVTIDogMjUwLFxyXG4gICAgICBNQVhfUkVTIDogMTAwMCxcclxuICAgICAgTUFYX1RFTVBMQVRFIDogXCJBXCIsXHJcbiAgICAgIFRIUkVTSE9MRF9ESVNUIDogNixcclxuICAgICAgTUFYX0RJU1QgOiAxNSxcclxuICAgICAgUkFNX1VOSVRTIDogeyBzcHk6MSwgc3BlYXI6MjUsIHN3b3JkOjUwIH0sXHJcbiAgICAgIFJBTVNfUEVSX1dBTExfTEVWRUwgOiBbMCwgMiwgNCwgNywgMTEsIDE1LCAyMCwgMjYsIDMzLCA0MiwgNTFdXHJcbiAgICB9LFxyXG4gICAgXHJcbiAgICBlbnYgOiBcInByb2RcIixcclxuICB9LFxyXG4gIFxyXG4gIC8qKiogVUkgKioqL1xyXG4gIFNJTVVMQVRJT05fQlROX0NMQVNTIDogXCJUV0ZBUC1idG4tc2ltdWxhdGlvblwiLFxyXG59OyIsIi8qIGdsb2JhbCBVSSAqL1xyXG4vKiBnbG9iYWwgVHJpYmFsV2FycyAqL1xyXG5cclxubGV0ICQgPSAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvd1snJCddIDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbFsnJCddIDogbnVsbCk7XHJcbmxldCBfID0gKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3dbJ18nXSA6IHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWxbJ18nXSA6IG51bGwpO1xyXG5sZXQgbG9nID0gcmVxdWlyZSgnbG9nbGV2ZWwnKS5nZXRMb2dnZXIoXCJCb3RPcmRlclwiKTtcclxuXHJcbmxldCBjb25zdGFudHMgPSByZXF1aXJlKCcuLy4uL2NvbnN0LmpzJyk7XHJcbmxldCBtaW5lciA9IHJlcXVpcmUoXCIuLy4uL21pbmVyXCIpO1xyXG5sZXQgdXRpbCA9IHJlcXVpcmUoXCIuLy4uL3V0aWxcIik7XHJcblxyXG5cclxuY2xhc3MgT3JkZXIge1xyXG4gIGNvbnN0cnVjdG9yIChwbHVuZGVyYWJsZV92aWxsYWdlLCBwcmlvcml0eSkgeyAgICBcclxuICAgIHRoaXMucGx1bmRlcmFibGVfdmlsbGFnZSA9IHBsdW5kZXJhYmxlX3ZpbGxhZ2U7XHJcbiAgICB0aGlzLnByaW9yaXR5ID0gcHJpb3JpdHk7XHJcbiAgfVxyXG4gIFxyXG4gIGdldCBvcmRlcl9idXR0b24gKCkge1xyXG4gICAgdGhyb3cgbmV3IEVycm9yKCdOb3QgaW1wbGVtZW50ZWQuJyk7XHJcbiAgfVxyXG4gIFxyXG4gIGV4ZWN1dGUgKCkgeyA7IH1cclxuICBcclxuICBzaW11bGF0ZSAoKSB7IDsgfVxyXG4gIFxyXG4gIGdldCB1bml0cyAoKSB7IHRocm93IEVycm9yKFwiTm90IGlucGxlbWVudGVkLlwiKTsgfVxyXG4gIFxyXG4gIGhhc0Vub3VnaFVuaXRzICgpIHsgXHJcbiAgICByZXR1cm4gIV8uaXNFbXB0eSh0aGlzLnVuaXRzKSAmJiB1dGlsLmhhc0Vub3VnaFVuaXRzKHRoaXMudW5pdHMpO1xyXG4gIH1cclxufVxyXG5leHBvcnRzLk9yZGVyID0gT3JkZXI7XHJcblxyXG5cclxuXHJcbmNsYXNzIFRlbXBsYXRlT3JkZXIgZXh0ZW5kcyBPcmRlciB7XHJcbiAgY29uc3RydWN0b3IgKHBsdW5kZXJhYmxlX3ZpbGxhZ2UsIG9yZGVyX2xldHRlciwgcHJpb3JpdHkpIHtcclxuICAgIGlmKCF1dGlsLmlzVmFsaWRPcmRlckxldHRlcihvcmRlcl9sZXR0ZXIpKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIm9yZGVyX2xldHRlciBpbnZhbGlkLlwiLCBvcmRlcl9sZXR0ZXIpO1xyXG4gICAgfVxyXG4gICAgc3VwZXIocGx1bmRlcmFibGVfdmlsbGFnZSwgcHJpb3JpdHkpO1xyXG4gICAgXHJcbiAgICB0aGlzLm9yZGVyX2xldHRlciA9IG9yZGVyX2xldHRlci50b0xvd2VyQ2FzZSgpO1xyXG4gIH1cclxuICBcclxuICBnZXQgb3JkZXJfYnV0dG9uICgpIHtcclxuICAgIHJldHVybiB0aGlzLnBsdW5kZXJhYmxlX3ZpbGxhZ2UuZ2V0T3JkZXJCdXR0b24odGhpcy5vcmRlcl9sZXR0ZXIpO1xyXG4gIH1cclxuICBcclxuICBleGVjdXRlICgpIHtcclxuICAgIGlmKHRoaXMuaGFzRW5vdWdoVW5pdHMoKSkge1xyXG4gICAgICBsb2cudHJhY2UoXCJUZW1wbGF0ZU9yZGVyIGV4ZWN1dGVcIiwgdGhpcyk7ICAgICAgXHJcbiAgICAgIHRoaXMub3JkZXJfYnV0dG9uLmNsaWNrKCk7XHJcbiAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgbG9nLnRyYWNlKFwiVGVtcGxhdGVPcmRlciBub3QgZW5vdWdoIHVuaXRzXCIsIHRoaXMpO1xyXG4gICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9IFxyXG4gIH1cclxuICBcclxuICBzaW11bGF0ZSAoKSB7XHJcbiAgICBsb2cudHJhY2UoXCJUZW1wbGF0ZU9yZGVyIHNpbXVsYXRlXCIsIHRoaXMpO1xyXG4gICAgXHJcbiAgICBsZXQgY3NzX2NsYXNzID0gY29uc3RhbnRzLlNJTVVMQVRJT05fQlROX0NMQVNTO1xyXG4gICAgdGhpcy5vcmRlcl9idXR0b24uYWRkQ2xhc3MoY3NzX2NsYXNzKTtcclxuICB9XHJcbiAgXHJcbiAgZ2V0IHVuaXRzICgpIHtcclxuICAgIGxldCB0ZW1wbGF0ZXMgPSBtaW5lci5taW5lVGVtcGxhdGVzKCk7IFxyXG4gICAgXHJcbiAgICBpZih0aGlzLm9yZGVyX2xldHRlciA9PT0gXCJhXCIpIHtcclxuICAgICAgcmV0dXJuIHRlbXBsYXRlc1tcIkFcIl07XHJcbiAgICB9IGVsc2UgaWYgKHRoaXMub3JkZXJfbGV0dGVyID09PSBcImJcIikge1xyXG4gICAgICByZXR1cm4gdGVtcGxhdGVzW1wiQlwiXTtcclxuICAgIH0gZWxzZSBpZiAodGhpcy5vcmRlcl9sZXR0ZXIgPT09IFwiY1wiKSB7XHJcbiAgICAgIHJldHVybiB0aGlzLnBsdW5kZXJhYmxlX3ZpbGxhZ2UudGVtcGxhdGVfYztcclxuICAgIH0gXHJcbiAgICBcclxuICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBvcmRlciBsZXR0ZXIgXCInICsgdGhpcy5vcmRlcl9sZXR0ZXIgKyAnXCIuJyk7XHJcbiAgfVxyXG59XHJcbmV4cG9ydHMuVGVtcGxhdGVPcmRlciA9IFRlbXBsYXRlT3JkZXI7XHJcblxyXG5cclxuXHJcbmNsYXNzIEN1c3RvbU9yZGVyIGV4dGVuZHMgT3JkZXIge1xyXG4gIGNvbnN0cnVjdG9yIChwbHVuZGVyYWJsZV92aWxsYWdlLCB1bml0cywgcHJpb3JpdHkpIHtcclxuICAgIGNvbnN0IERFRkFVTFRfVU5JVFMgPSB7c3BlYXI6MCwgc3dvcmQ6MCwgYXhlOjAsIGFyY2hlcjowLCBzcHk6MCwgbGlnaHQ6MCwgbWFyY2hlcjowLCBoZWF2eTowLCByYW06MCwgY2F0YXB1bHQ6MCwga25pZ2h0OjAsIHNub2I6MCwgbWlsaXRpYTowfTtcclxuICAgIFxyXG4gICAgc3VwZXIocGx1bmRlcmFibGVfdmlsbGFnZSwgcHJpb3JpdHkpO1xyXG4gICAgXHJcbiAgICB0aGlzLl91bml0cyA9IF8uZGVmYXVsdHModW5pdHMsIERFRkFVTFRfVU5JVFMpO1xyXG4gIH1cclxuICAgIFxyXG4gIGdldCBvcmRlcl9idXR0b24gKCkge1xyXG4gICAgcmV0dXJuIHRoaXMucGx1bmRlcmFibGVfdmlsbGFnZS5hdHRhY2tfcGxhY2VfYnV0dG9uO1xyXG4gIH1cclxuICAgIFxyXG4gIGV4ZWN1dGUgKCkge1xyXG4gICAgaWYoIXRoaXMuaGFzRW5vdWdoVW5pdHMoKSkge1xyXG4gICAgICBsb2cudHJhY2UoXCJUZW1wbGF0ZU9yZGVyIG5vdCBlbm91Z2ggdW5pdHNcIiwgdGhpcyk7XHJcbiAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH0gXHJcbiAgICBcclxuICAgIGxldCBwdiA9IHRoaXMucGx1bmRlcmFibGVfdmlsbGFnZTtcclxuICAgIFxyXG4gICAgLy8gT3BlbiB0aGUgY29tbWFuZCBwb3B1cFxyXG4gICAgdmFyIHBhcmFtcyA9ICQuZXh0ZW5kKHthamF4Oidjb21tYW5kJ30sIHsgdGFyZ2V0IDogcHYuaWQgfSApO1xyXG4gICAgXHJcbiAgICBUcmliYWxXYXJzLmdldCgncGxhY2UnLCBwYXJhbXMsIC8vIFNlbmQgcmVxdWVzdCBmb3IgYSBjb21tYW5kIHBvcHVwXHJcbiAgICAgIChyZXNwb25zZSkgPT4ge1xyXG4gICAgICAgIGxldCBkX2pxID0gJChcIjxkaXY+XCIgKyByZXNwb25zZS5kaWFsb2cgKyBcIjwvZGl2PlwiKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBVbml0c1xyXG4gICAgICAgIF8uZm9ySW4odGhpcy51bml0cywgKHYsIGspID0+IGRfanEuZmluZChcIiNjb21tYW5kLWRhdGEtZm9ybSBpbnB1dFtuYW1lPVwiICsgayArIFwiXVwiKS52YWwodikpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFBvc2l0aW9uXHJcbiAgICAgICAgZF9qcS5maW5kKFwiI2NvbW1hbmQtZGF0YS1mb3JtIGlucHV0W25hbWU9eF1cIikudmFsKHB2LmNvb3JkaW5hdGVzLngpO1xyXG4gICAgICAgIGRfanEuZmluZChcIiNjb21tYW5kLWRhdGEtZm9ybSBpbnB1dFtuYW1lPXldXCIpLnZhbChwdi5jb29yZGluYXRlcy55KTtcclxuICAgICAgICBcclxuICAgICAgICBsZXQgZGF0YSA9IGRfanEuZmluZChcIiNjb21tYW5kLWRhdGEtZm9ybVwiKS5zZXJpYWxpemVBcnJheSgpO1xyXG4gICAgICAgIGRhdGEucHVzaCh7IG5hbWU6IFwiYXR0YWNrXCIsIHZhbHVlOiAnbCcgfSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgVHJpYmFsV2Fycy5wb3N0KCdwbGFjZScsIHsgYWpheDogJ2NvbmZpcm0nIH0sIGRhdGEsIC8vIENvbmZpcm0gYXR0YWNrXHJcbiAgICAgICAgICAocmVzcG9uc2VfY29uZmlybSkgPT4ge1xyXG4gICAgICAgICAgICBsZXQgZF9jb25maXJtX2pxID0gJChcIjxkaXY+XCIgKyByZXNwb25zZV9jb25maXJtLmRpYWxvZyArIFwiPC9kaXY+XCIpO1xyXG4gICAgICAgICAgICBsZXQgY29uZmlybV9kYXRhID0gZF9jb25maXJtX2pxLmZpbmQoJyNjb21tYW5kLWRhdGEtZm9ybScpLnNlcmlhbGl6ZUFycmF5KCk7XHJcbiAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIFRyaWJhbFdhcnMucG9zdCgncGxhY2UnLCB7IGFqYXhhY3Rpb246ICdwb3B1cF9jb21tYW5kJyB9LCBjb25maXJtX2RhdGEsIC8vIEZpbmFsIHJlc3BvbnNlXHJcbiAgICAgICAgICAgICAgKHJlc3BvbnNlX2ZpbmFsKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBVSS5TdWNjZXNzTWVzc2FnZShyZXNwb25zZV9maW5hbC5tZXNzYWdlKTtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKHJlc3BvbnNlX2ZpbmFsKTtcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgKTtcclxuICAgICAgfVxyXG4gICAgKTtcclxuICAgIFxyXG4gICAgcmV0dXJuIHRydWU7XHJcbiAgfVxyXG4gIFxyXG4gIHNpbXVsYXRlICgpIHtcclxuICAgIGxvZy50cmFjZShcIkN1c3RvbU9yZGVyIHNpbXVsYXRlXCIsIHRoaXMpO1xyXG4gICAgXHJcbiAgICBsZXQgY3NzX2NsYXNzID0gY29uc3RhbnRzLlNJTVVMQVRJT05fQlROX0NMQVNTO1xyXG4gICAgdGhpcy5vcmRlcl9idXR0b24uYWRkQ2xhc3MoY3NzX2NsYXNzKTtcclxuICB9XHJcbiAgXHJcbiAgZ2V0IHVuaXRzICgpIHtcclxuICAgIHJldHVybiB0aGlzLl91bml0cztcclxuICB9XHJcbn1cclxuZXhwb3J0cy5DdXN0b21PcmRlciA9IEN1c3RvbU9yZGVyOyIsImxldCAkID0gKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3dbJyQnXSA6IHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWxbJyQnXSA6IG51bGwpO1xyXG5sZXQgXyA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93WydfJ10gOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsWydfJ10gOiBudWxsKTtcclxubGV0IGxvZyA9IHJlcXVpcmUoJ2xvZ2xldmVsJykuZ2V0TG9nZ2VyKFwiUGx1bmRlcmFibGVWaWxsYWdlXCIpO1xyXG5cclxubGV0IHV0aWwgPSByZXF1aXJlKFwiLi8uLi91dGlsXCIpO1xyXG5cclxuXHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IGNsYXNzIFBsdW5kZXJhYmxlVmlsbGFnZSB7XHJcbiAgY29uc3RydWN0b3IgKGlkLCByZXBvcnRfaWQsIGNvb3JkaW5hdGVzLCBpc19hdHRhY2tpbmcsIHJlcywgd2FsbCwgZGlzdGFuY2UsIHRlbXBsYXRlX2MpIHtcclxuICAgIFwidXNlIHN0cmljdFwiO1xyXG4gICAgXHJcbiAgICB0aGlzLmlkID0gaWQ7XHJcbiAgICB0aGlzLnJlcG9ydF9pZCA9IHJlcG9ydF9pZDtcclxuICAgIHRoaXMuY29vcmRpbmF0ZXMgPSBjb29yZGluYXRlcztcclxuICAgIHRoaXMuaXNfYXR0YWNraW5nID0gaXNfYXR0YWNraW5nO1xyXG4gICAgdGhpcy5yZXMgPSByZXM7XHJcbiAgICB0aGlzLndhbGwgPSB3YWxsO1xyXG4gICAgdGhpcy5kaXN0YW5jZSA9IGRpc3RhbmNlO1xyXG4gICAgdGhpcy50ZW1wbGF0ZV9jID0gdGVtcGxhdGVfYztcclxuICB9XHJcbiAgXHJcbiAgZ2V0IFRSICgpIHtcclxuICAgIFwidXNlIHN0cmljdFwiXHJcbiAgICBcclxuICAgIHJldHVybiAkKCcjJyArIHRoaXMudHJfaWQpLmZpcnN0KCk7XHJcbiAgfVxyXG4gIFxyXG4gIGdldCB0cl9pZCAoKSB7XHJcbiAgICByZXR1cm4gXCJ2aWxsYWdlX1wiICsgdGhpcy5pZDtcclxuICB9XHJcbiAgXHJcbiAgZ2V0VG90YWxSZXMgKCkge1xyXG4gICAgXCJ1c2Ugc3RyaWN0XCI7XHJcbiAgICBcclxuICAgIHJldHVybiBfLnN1bShfLnZhbHVlcyh0aGlzLnJlcykpO1xyXG4gIH1cclxuICBcclxuICBnZXRPcmRlckJ1dHRvbiAob3JkZXJfbGV0dGVyKSB7XHJcbiAgICBpZiAoIXV0aWwuaXNWYWxpZE9yZGVyTGV0dGVyKG9yZGVyX2xldHRlcikpIHsgLy8gb3JkZXJfbGV0dGVyIGlzbid0IGEsIGIgb3IgY1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IgKCdcIicgKyBvcmRlcl9sZXR0ZXIgKyAnXCJpcyBub3QgYSB2YWxpZCBvcmRlcl9sZXR0ZXIuIE11c3QgYmUgQSwgQiBvciBDIChjYXNlIGluc2Vuc2l0aXZlKS4nKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgb3JkZXJfbGV0dGVyID0gb3JkZXJfbGV0dGVyLnRvTG93ZXJDYXNlKCk7XHJcbiAgICBcclxuICAgIGxldCBxdWVyeSA9IFwiLmZhcm1faWNvbl9cIiArIG9yZGVyX2xldHRlcjsgIFxyXG4gICAgcmV0dXJuIHRoaXMuVFIuZmluZChxdWVyeSk7XHJcbiAgfVxyXG4gIFxyXG4gIGlzT3JkZXJBdmFpYWJsZSAob3JkZXJfbGV0dGVyKSB7XHJcbiAgICByZXR1cm4gdGhpcy5nZXRPcmRlckJ1dHRvbihvcmRlcl9sZXR0ZXIpLmhhc0NsYXNzKFwiZmFybV9pY29uX2Rpc2FibGVkXCIpO1xyXG4gIH1cclxuICBcclxuICBnZXQgYXR0YWNrX3BsYWNlX2J1dHRvbiAoKSB7XHJcbiAgICByZXR1cm4gdGhpcy5UUi5maW5kKFwiaW1nW3NyYyo9cGxhY2VdXCIpO1xyXG4gIH1cclxuICBcclxuICBjbGlja09yZGVyIChvcmRlcl9sZXR0ZXIpIHtcclxuICAgIGxvZy5pbmZvKFwiY2xpY2tlZFwiLCBvcmRlcl9sZXR0ZXIsIHRoaXMpO1xyXG4gICAgdGhpcy5nZXRPcmRlckJ1dHRvbihvcmRlcl9sZXR0ZXIpLmNsaWNrKCk7XHJcbiAgfVxyXG59IiwiXCJ1c2Ugc3RyaWN0XCI7XHJcblxyXG5sZXQgJCA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93WyckJ10gOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsWyckJ10gOiBudWxsKTtcclxubGV0IF8gPSAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvd1snXyddIDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbFsnXyddIDogbnVsbCk7XHJcbmxldCBsb2cgPSByZXF1aXJlKCdsb2dsZXZlbCcpO1xyXG5cclxubGV0IFNldHRpbmdzID0gcmVxdWlyZShcIi4vc2V0dGluZ3NcIik7XHJcblxyXG5mdW5jdGlvbiBzZXRMb2dMZXZlbCAoKSB7XHJcbiAgaWYgKFNldHRpbmdzLmVudiA9PT0gXCJkZXZcIikge1xyXG4gICAgbG9nLnNldExldmVsKGxvZy5sZXZlbHMuVFJBQ0UsIGZhbHNlKTsgIFxyXG4gIH0gZWxzZSB7XHJcbiAgICBsb2cuc2V0TGV2ZWwobG9nLmxldmVscy5FUlJPUiwgZmFsc2UpO1xyXG4gIH0gIFxyXG59XHJcbnNldExvZ0xldmVsKCk7XHJcblxyXG5sZXQgVUkgPSByZXF1aXJlKFwiLi91aVwiKTtcclxuXHJcbi8qKiogR2xvYmFsIEZucyAqKiovXHJcbndpbmRvdy5UV0ZBUF9Ub2dnbGVfRW52ID0gZnVuY3Rpb24gKCkge1xyXG4gIFNldHRpbmdzLmVudiA9IChTZXR0aW5ncy5lbnYgPT09IFwicHJvZFwiKSA/IFwiZGV2XCIgOiBcInByb2RcIjtcclxuICBzZXRMb2dMZXZlbCgpO1xyXG4gIFxyXG4gIGNvbnNvbGUubG9nKFwiRW52aXJvbWVudCBpcyBub3c6XCIsIFNldHRpbmdzLmVudik7XHJcbn1cclxuXHJcblxyXG4vKioqIEV4ZWN1dGlvbiAqKiovXHJcblVJLmluamVjdFVJKCk7IiwibGV0ICQgPSAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvd1snJCddIDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbFsnJCddIDogbnVsbCk7XHJcbmxldCBfID0gKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3dbJ18nXSA6IHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWxbJ18nXSA6IG51bGwpO1xyXG5sZXQgbG9nID0gcmVxdWlyZSgnbG9nbGV2ZWwnKS5nZXRMb2dnZXIoXCJNaW5lclwiKTtcclxuXHJcbmxldCBQbHVuZGVyYWJsZVZpbGxhZ2UgPSByZXF1aXJlKFwiLi9kYXRhL3BsdW5kZXJhYmxlLXZpbGxhZ2VcIik7XHJcbmxldCBNaW5lciA9IHJlcXVpcmUoXCIuL21pbmVyXCIpO1xyXG5cclxuXHJcblxyXG5leHBvcnRzLnBhcnNlUmVzb3VyY2UgPSBmdW5jdGlvbiAocmVzX3RleHQpIHtcclxuICBcInVzZSBzdHJpY3RcIjtcclxuXHJcbiAgLy8gUmF3IGZvcm1hdDogXCIgIDEuNjUyIDk1MCAyLjAxNSBcIlxyXG4gIGxldCByID1fKHJlc190ZXh0KVxyXG4gICAgLnJlcGxhY2UoL1xcLi9nLCBcIlwiKVxyXG4gICAgLnRyaW0oKVxyXG4gICAgLnNwbGl0KFwiIFwiKVxyXG4gICAgLmZpbHRlcihmdW5jdGlvbiAoeCkgeyByZXR1cm4geCAhPT0gXCJcIjsgfSlcclxuICAgIC5tYXAoXy5wYXJzZUludCk7XHJcbiAgICBcclxuICAgIHJldHVybiB7IHdvb2Q6clswXSwgc3RvbmU6clsxXSwgaXJvbjpyWzJdIH07XHJcbn1cclxuXHJcbmV4cG9ydHMucGFyc2VDb29yZGluYXRlcyA9IGZ1bmN0aW9uIChwb3NpdGlvbl90ZXh0KSB7XHJcbiAgbGV0IHBvcyA9IC9cXCgoXFxkKylcXHwoXFxkKylcXCkvLmV4ZWMocG9zaXRpb25fdGV4dCk7XHJcbiAgcmV0dXJuIHt4IDogXy5wYXJzZUludChwb3NbMV0pLCB5IDogXy5wYXJzZUludChwb3NbMl0pIH07ICBcclxufVxyXG5cclxuZXhwb3J0cy5taW5lUGx1bmRlclZpbGxhZ2VzID0gZnVuY3Rpb24gKCkge1xyXG4gIFwidXNlIHN0cmljdFwiO1xyXG4gIFxyXG4gIGxldCBwbHVuZGVyYWJsZV92aWxsYWdlcyA9IFtdO1xyXG4gIFxyXG4gIC8vIEdldCB2aWxsYWdlcyBkYXRhXHJcbiAgJChcIiNwbHVuZGVyX2xpc3QgW2lkKj12aWxsYWdlX11cIilcclxuICAgIC5lYWNoKCAoaW5kZXgsIGVsZW1lbnQpID0+IHtcclxuICAgICAgdHJ5IHtcclxuICAgICAgICBsZXQgamUgPSAkKGVsZW1lbnQpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGxldCB0cl9pZCA9IGplLmF0dHIoXCJpZFwiKTtcclxuICAgICAgICBsZXQgaWQgPSBfLnBhcnNlSW50KF8uZmlyc3QoL1xcZCsvLmV4ZWModHJfaWQpKSk7XHJcbiAgICAgICAgbGV0IHJlcG9ydF9pZCA9IF8ucGFyc2VJbnQoXy5sYXN0KC92aWV3PShcXGQrKS8uZXhlYyhqZS5maW5kKFwiYVtocmVmKj1yZXBvcnRdXCIpLmF0dHIoXCJocmVmXCIpKSkpO1xyXG4gICAgICAgIGxldCBjb29yZGluYXRlcyA9ICBNaW5lci5wYXJzZUNvb3JkaW5hdGVzKGplLmZpbmQoXCJhW2hyZWYqPXJlcG9ydF1cIikudGV4dCgpKTtcclxuICAgICAgICBsZXQgaXNfYXR0YWNraW5nID0gIV8uaXNFbXB0eShqZS5maW5kKFwiaW1nW3NyYyo9YXR0YWNrXVwiKSk7XHJcbiAgICAgICAgbGV0IHJlcyA9IE1pbmVyLnBhcnNlUmVzb3VyY2UoamUuZmluZChcInRkOm50aC1jaGlsZCg2KVwiKS50ZXh0KCkpO1xyXG4gICAgICAgIGxldCB3YWxsID0gXy5wYXJzZUludChqZS5maW5kKFwidGQ6bnRoLWNoaWxkKDcpXCIpLnRleHQoKSk7XHJcbiAgICAgICAgbGV0IGRpc3RhbmNlID0gcGFyc2VGbG9hdChqZS5maW5kKFwidGQ6bnRoLWNoaWxkKDgpXCIpLnRleHQoKSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gVGVtcGxhdGUgQ1xyXG4gICAgICAgIGxldCB0ZW1wbGF0ZV9jX2EgPSBqZS5maW5kKFwiYVtkYXRhLXVuaXRzLWZvcmVjYXN0XVwiKTtcclxuICAgICAgICBsZXQgdGVtcGxhdGVfYyA9IHt9O1xyXG4gICAgICAgIGlmKCF0ZW1wbGF0ZV9jX2EuaGFzQ2xhc3MoXCJmYXJtX2ljb25fZGlzYWJsZWRcIikpIHtcclxuICAgICAgICAgIHRlbXBsYXRlX2MgPSBKU09OLnBhcnNlKHRlbXBsYXRlX2NfYS5hdHRyKFwiZGF0YS11bml0cy1mb3JlY2FzdFwiKSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIENyZWF0ZSBvYmplY3RcclxuICAgICAgICBsZXQgcHYgPSBuZXcgUGx1bmRlcmFibGVWaWxsYWdlKGlkLCByZXBvcnRfaWQsIGNvb3JkaW5hdGVzLCBpc19hdHRhY2tpbmcsIHJlcywgd2FsbCwgZGlzdGFuY2UsIHRlbXBsYXRlX2MpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGxvZy50cmFjZShcIk1pbmVkIHZpbGxhZ2VcIiwgcHYpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHBsdW5kZXJhYmxlX3ZpbGxhZ2VzLnB1c2gocHYpO1xyXG4gICAgICAgIFxyXG4gICAgICB9IGNhdGNoIChlcnIpIHtcclxuICAgICAgICBsb2cud2FybihcIlVuYWJsZSB0byBtaW5lIHBsdW5kZXJhYmxlIHZpbGxhZ2VcIiwgZWxlbWVudCwgZXJyKTtcclxuICAgICAgfSAgICBcclxuICAgIH1cclxuICApO1xyXG4gIFxyXG4gIHJldHVybiBwbHVuZGVyYWJsZV92aWxsYWdlcztcclxufTtcclxuXHJcbmV4cG9ydHMubWluZUN1cnJlbnRVbml0cyA9IGZ1bmN0aW9uICgpIHtcclxuICByZXR1cm4gd2luZG93LkFjY291bnRtYW5hZ2VyLmZhcm0uY3VycmVudF91bml0cztcclxufVxyXG5cclxuZXhwb3J0cy5taW5lVGVtcGxhdGVzID0gXy5vbmNlKGZ1bmN0aW9uICgpIHtcclxuICBjb25zdCBERUZBVUxUX1RFTVBMQVRFID0ge3NwZWFyIDogMCwgc3dvcmQgOiAwLCBheGUgOiAwLCBhcmNoZXIgOiAwLCBzcHkgOiAwLCBsaWdodCA6IDAsIG1hcmNoZXIgOiAwLCBoZWF2eSA6IDAsIGtuaWdodCA6IDB9O1xyXG4gIFxyXG4gIGxldCB0ZW1wbGF0ZXMgPSB3aW5kb3cuQWNjb3VudG1hbmFnZXIuZmFybS50ZW1wbGF0ZXM7XHJcbiAgbGV0IHRlbXBsYXRlc19rZXlzID0gXy5rZXlzKHdpbmRvdy5BY2NvdW50bWFuYWdlci5mYXJtLnRlbXBsYXRlcyk7XHJcbiAgXHJcbiAgbGV0IHRlbXBsYXRlX0EgPSBfLmRlZmF1bHRzKHRlbXBsYXRlc1tfLmZpcnN0KHRlbXBsYXRlc19rZXlzKV0sIERFRkFVTFRfVEVNUExBVEUpO1xyXG4gIGxldCB0ZW1wbGF0ZV9CID0gXy5kZWZhdWx0cyh0ZW1wbGF0ZXNbXy5maXJzdCh0ZW1wbGF0ZXNfa2V5cyldLCBERUZBVUxUX1RFTVBMQVRFKTtcclxuICBcclxuICB0ZW1wbGF0ZXMgPSB7QTp0ZW1wbGF0ZV9BLCBCOnRlbXBsYXRlX0J9O1xyXG4gIFxyXG4gIGxvZy50cmFjZShcIk1pbmVkIHRlbXBsYXRlc1wiLCB0ZW1wbGF0ZXMpO1xyXG4gIFxyXG4gIHJldHVybiB0ZW1wbGF0ZXM7XHJcbn0pOyIsIi8qKiogSW1wb3J0cyAqKiovXHJcbmxldCBfID0gKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3dbJ18nXSA6IHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWxbJ18nXSA6IG51bGwpO1xyXG5cclxubGV0IFN0b3JhZ2UgPSByZXF1aXJlKCcuL3N0b3JhZ2UnKTtcclxubGV0IGNvbnN0YW50cyA9IHJlcXVpcmUoJy4vY29uc3QnKTtcclxuXHJcbi8vIENvbnN0c1xyXG5jb25zdCBTRVRUSU5HU19TVE9SQUdFX05BTUUgPSBcIlNldHRpbmdzXCI7XHJcblxyXG5sZXQgU2V0dGluZ3MgPSBfLmRlZmF1bHRzRGVlcChTdG9yYWdlLmdldChTRVRUSU5HU19TVE9SQUdFX05BTUUsIHt9KSwgY29uc3RhbnRzLkRFRkFVTFRfU0VUVElOR1MpO1xyXG5cclxuT2JqZWN0Lm9ic2VydmUoU2V0dGluZ3MsXHJcbiAgZnVuY3Rpb24gKGNoYW5nZXMpIHtcclxuICAgIFN0b3JhZ2Uuc2V0KFNFVFRJTkdTX1NUT1JBR0VfTkFNRSwgXy5sYXN0KGNoYW5nZXMpLm9iamVjdCk7XHJcbiAgfVxyXG4pO1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBTZXR0aW5nczsiLCIvKiBnbG9iYWwgR01fc2V0VmFsdWUgKi9cclxuLyogZ2xvYmFsIEdNX2dldFZhbHVlICovXHJcbiAgXHJcbmxldCBfID0gKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3dbJ18nXSA6IHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWxbJ18nXSA6IG51bGwpO1xyXG5cclxuZXhwb3J0cy5nZXQgPSBmdW5jdGlvbiAobmFtZSwgZGVmYXVsdHkpIHtcclxuICByZXR1cm4gR01fZ2V0VmFsdWUobmFtZSwgZGVmYXVsdHkpOyBcclxufVxyXG5cclxuZXhwb3J0cy5zZXQgPSBmdW5jdGlvbiAobmFtZSwgdmFsdWUpIHtcclxuICByZXR1cm4gR01fc2V0VmFsdWUobmFtZSwgdmFsdWUpO1xyXG59ICIsIi8qIGdsb2JhbCBHTV9hZGRTdHlsZSAqL1xyXG5cclxuXHJcblxyXG5sZXQgJCA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93WyckJ10gOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsWyckJ10gOiBudWxsKTtcclxubGV0IF8gPSAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvd1snXyddIDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbFsnXyddIDogbnVsbCk7XHJcbmxldCBsb2cgPSByZXF1aXJlKCdsb2dsZXZlbCcpLmdldExvZ2dlcihcIlVJXCIpO1xyXG5sZXQgU3RhdGVNYWNoaW5lID0gcmVxdWlyZShcImphdmFzY3JpcHQtc3RhdGUtbWFjaGluZVwiKTtcclxuXHJcbmxldCBjb25zdGFudHMgPSByZXF1aXJlKFwiLi9jb25zdFwiKTtcclxubGV0IHNldHRpbmdzID0gcmVxdWlyZShcIi4vc2V0dGluZ3NcIik7XHJcbmxldCBtaW5lciA9IHJlcXVpcmUoXCIuL21pbmVyXCIpO1xyXG5sZXQgYm90ID0gcmVxdWlyZShcIi4vYm90XCIpO1xyXG5cclxuLyoqKiBFeGVjdXRpb24gRlNNICoqKi9cclxudmFyIGV4ZWN1dGlvbl9mc20gPSBTdGF0ZU1hY2hpbmUuY3JlYXRlKHtcclxuICBpbml0aWFsOiAnaW5pdCcsXHJcbiAgZXZlbnRzOiBbXHJcbiAgICB7IG5hbWU6ICdleGVjdXRlJywgIGZyb206ICdpbml0JywgIHRvOiAnZXhlY3V0aW5nJyB9LFxyXG4gICAgeyBuYW1lOiAnZG9uZScsIGZyb206ICdleGVjdXRpbmcnLCB0bzogJ2V4ZWN1dGVkJ30sXHJcbiAgICB7IG5hbWU6ICdyZWxvYWQnLCAgZnJvbTogJ2V4ZWN1dGVkJywgICAgdG86ICdyZWxvYWRpbmcnfVxyXG5dfSk7XHJcblxyXG5leGVjdXRpb25fZnNtLm9uZXhlY3V0ZSA9IGZ1bmN0aW9uICgpIHtcclxuICBib3QuZXhlY3V0ZSgpXHJcbiAgICAudGhlbihfLmJpbmQoZXhlY3V0aW9uX2ZzbS5kb25lLCBleGVjdXRpb25fZnNtKSk7XHJcbn1cclxuXHJcbmV4ZWN1dGlvbl9mc20ub25yZWxvYWQgPSBmdW5jdGlvbiAoKSB7XHJcbiAgbG9jYXRpb24ucmVsb2FkKCk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGFwcGVuZFRvdGFsUmVzQ29sICgpIHtcclxuICAvKiogQXBwZW5kIHRvdGFsIHJlc291cmNlcyB0byByZXNvdXJjZXMgY29sdW1uICoqL1xyXG4gICQoJyNwbHVuZGVyX2xpc3QgdHIgdGQ6bnRoLWNoaWxkKDYpJykuZWFjaChmdW5jdGlvbiAoKSB7XHJcbiAgICBcInVzZSBzdHJpY3RcIjtcclxuICAgIFxyXG4gICAgbGV0IHJlc19qcSA9ICQodGhpcyk7XHJcbiAgICBsZXQgcmVzID0gbWluZXIucGFyc2VSZXNvdXJjZShyZXNfanEudGV4dCgpKTtcclxuICAgIGxldCByZXNfc3VtID0gXy5zdW0oXy52YWx1ZXMocmVzKSk7XHJcbiAgICBcclxuICAgIHJlc19qcS5hcHBlbmQoJyA8c3BhbiBjbGFzcz1cImljb24gaGVhZGVyIHJlc3NvdXJjZXNcIj48L3NwYW4+ICcgKyByZXNfc3VtKTtcclxuICB9KTtcclxufVxyXG5cclxuXHJcblxyXG5leHBvcnRzLmluamVjdFVJID0gZnVuY3Rpb24gKCkge1xyXG4gIC8vIExvYWQgZmlsZXNcclxuICBsZXQgdWlfaHRtbCA9IFwiPGRpdiBjbGFzcz1cXFwidmlzXFxcIj5cXHJcXG4gIDx0YWJsZSBzdHlsZT1cXFwid2lkdGg6MTAwJVxcXCI+XFxyXFxuICAgIDx0Ym9keT5cXHJcXG4gICAgICA8dHI+IDwhLS0gSGVhZGVyIC0tPlxcclxcbiAgICAgICAgXFxyXFxuICAgICAgICA8dGggY2xhc3M9XFxcInZpc1xcXCI+XFxyXFxuICAgICAgICAgIDxoND5UV0ZBUDogPC9oND5cXHJcXG4gICAgICAgIDwvdGg+XFxyXFxuICAgICAgICBcXHJcXG4gICAgICA8L3RyPlxcclxcbiAgICAgICBcXHJcXG4gICAgICBcXHJcXG4gICAgICA8dHI+IDwhLS0gQ29uZmlncyAtLT5cXHJcXG4gICAgICAgIFxcclxcbiAgICAgICAgPHRkPlxcclxcbiAgICAgICAgICA8aW5wdXQgaWQ9XFxcIlRXRkFQLWJ0bi1leGVjdXRlXFxcIiB0eXBlPVxcXCJzdWJtaXRcXFwiIHZhbHVlPVxcXCJFeGVjdHV0ZSBGYXJtXFxcIiBjbGFzcz1cXFwiYnRuXFxcIiBzdHlsZT1cXFwiZmxvYXQ6IGxlZnQ7XFxcIiAvPlxcclxcbiAgICAgICAgICBcXHJcXG4gICAgICAgICAgPGlucHV0IGlkPVxcXCJUV0ZBUC1idG4tc2ltdWxhdGVcXFwiIHR5cGU9XFxcInN1Ym1pdFxcXCIgdmFsdWU9XFxcIlNpbXVsYXRlIEZhcm1cXFwiIGNsYXNzPVxcXCJidG5cXFwiIHN0eWxlPVxcXCJmbG9hdDogbGVmdDtcXFwiIC8+XFxyXFxuICAgICAgICAgIFxcclxcbiAgICAgICAgICA8aW5wdXQgaWQ9XFxcIlRXRkFQLWJ0bi1jbGVhci1zaW11bGF0aW9uXFxcIiB0eXBlPVxcXCJzdWJtaXRcXFwiIHZhbHVlPVxcXCJDbGVhciBTaW11bGF0aW9uXFxcIiBjbGFzcz1cXFwiYnRuXFxcIiBzdHlsZT1cXFwiZmxvYXQ6IGxlZnQ7XFxcIiAvPlxcclxcbiAgICAgICAgICBcXHJcXG4gICAgICAgICAgXFxyXFxuICAgICAgICA8L3RkPlxcclxcbiAgICAgICAgXFxyXFxuICAgICAgPC90cj5cXHJcXG4gICAgICBcXHJcXG4gICAgICA8dHI+XFxyXFxuICAgICAgICA8dGQ+XFxyXFxuICAgICAgICAgIDxwcm9ncmVzcyBpZD1cXFwiVFdGQVAtcHJvZ3Jlc3MtZXhlY3V0aW9uXFxcIiB2YWx1ZT1cXFwiMFxcXCIgbWF4PVxcXCIwXFxcIiBzdHlsZT1cXFwid2lkdGg6MTAwJTtcXFwiPjwvcHJvZ3Jlc3M+XFxyXFxuICAgICAgICA8L3RkPlxcclxcbiAgICAgIDwvdHI+ICAgICAgXFxyXFxuICAgICAgXFxyXFxuICAgICAgPHRyPlxcclxcbiAgICAgICAgPHRkPlxcclxcbiAgICAgICAgICA8dGV4dGFyZWEgaWQ9XFxcIlRXRkFQLXR4dGFyZWEtc2V0dGluZ3NcXFwiIHJvd3M9XFxcIjEwXFxcIiBzdHlsZT1cXFwid2lkdGg6MTAwJTtcXFwiPjwvdGV4dGFyZWE+XFxyXFxuICAgICAgICA8L3RkPlxcclxcbiAgICAgIDwvdHI+XFxyXFxuICAgICAgXFxyXFxuICAgICAgPHRyPlxcclxcbiAgICAgICAgPHRkPlxcclxcbiAgICAgICAgICA8aW5wdXQgaWQ9XFxcIlRXRkFQLWJ0bi1zYXZlLXNldHRpbmdzXFxcIiB0eXBlPVxcXCJzdWJtaXRcXFwiIHZhbHVlPVxcXCJTYXZlIHNldHRpbmdzXFxcIiBjbGFzcz1cXFwiYnRuXFxcIiBzdHlsZT1cXFwiZmxvYXQ6IHJpZ2h0O1xcXCIgLz5cXHJcXG4gICAgICAgICAgXFxyXFxuICAgICAgICAgIDxpbnB1dCBpZD1cXFwiVFdGQVAtYnRuLXJlc2V0LXNldHRpbmdzXFxcIiB0eXBlPVxcXCJzdWJtaXRcXFwiIHZhbHVlPVxcXCJSZXNldCBzZXR0aW5nc1xcXCIgY2xhc3M9XFxcImJ0blxcXCIgc3R5bGU9XFxcImZsb2F0OiByaWdodDtcXFwiIC8+XFxyXFxuICAgICAgICA8L3RkPlxcclxcbiAgICAgIDwvdHI+XFxyXFxuICAgICAgXFxyXFxuICAgICAgICAgIFxcclxcbiAgICA8L3Rib2R5PlxcclxcbiAgPC90YWJsZT5cXHJcXG48L2Rpdj5cXHJcXG5cIjtcclxuICBsZXQgY3NzID0gQnVmZmVyKFwiTGxSWFJsQXRZblJ1TFhOcGJYVnNZWFJwYjI0Z2V3MEtJQ0JpYjNKa1pYSWdPaUF6Y0hnZ1pHRnphR1ZrSUdkeVpXVnVPdzBLZlE9PVwiLFwiYmFzZTY0XCIpOyBcclxuICBcclxuICAvLyBJbmplY3Qgc3R5bGVzaGVldFxyXG4gIEdNX2FkZFN0eWxlKGNzcyk7XHJcbiAgIFxyXG4gIC8vIEluamVjdCBib3QgaW50ZXJmYWNlXHJcbiAgJChcIiNmYXJtX3VuaXRzXCIpLnBhcmVudCgpLmFmdGVyKHVpX2h0bWwpO1xyXG4gIFxyXG4gIC8vIEJpbmQgZXZlbnRzXHJcbiAgJChcIiNUV0ZBUC1idG4tZXhlY3V0ZVwiKS5jbGljaygoKSA9PiB7XHJcbiAgICBpZihleGVjdXRpb25fZnNtLmNhbihcImV4ZWN1dGVcIikpIHtcclxuICAgICAgZXhlY3V0aW9uX2ZzbS5leGVjdXRlKCk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBleGVjdXRpb25fZnNtLnJlbG9hZCgpO1xyXG4gICAgfVxyXG4gIH0pO1xyXG4gIFxyXG4gICQoXCIjVFdGQVAtYnRuLXNpbXVsYXRlXCIpLmNsaWNrKF8uYmluZChib3Quc2ltdWxhdGUsIGJvdCkpO1xyXG4gICQoXCIjVFdGQVAtYnRuLWNsZWFyLXNpbXVsYXRpb25cIikuY2xpY2soXy5iaW5kKGJvdC5jbGVhclNpbXVsYXRpb24sIGJvdCkpO1xyXG4gICQoXCIjVFdGQVAtdHh0YXJlYS1zZXR0aW5nc1wiKS52YWwoSlNPTi5zdHJpbmdpZnkoc2V0dGluZ3MpKTtcclxuICBcclxuICAkKFwiI1RXRkFQLWJ0bi1zYXZlLXNldHRpbmdzXCIpLmNsaWNrKCgpID0+IHtcclxuICAgIGxldCBuZXdTZXR0aW5ncyA9IEpTT04ucGFyc2UoJChcIiNUV0ZBUC10eHRhcmVhLXNldHRpbmdzXCIpLnZhbCgpKTtcclxuICAgIGxvZy5pbmZvKFwiVUkgbmV3IFNldHRpbmdzOlwiLCBuZXdTZXR0aW5ncyk7XHJcbiAgICBcclxuICAgIGZvciAodmFyIG1lbWJlciBpbiBzZXR0aW5ncykgZGVsZXRlIHNldHRpbmdzW21lbWJlcl07XHJcbiAgICBfLmFzc2lnbihzZXR0aW5ncywgbmV3U2V0dGluZ3MpO1xyXG4gIH0pO1xyXG4gIFxyXG4gICQoXCIjVFdGQVAtYnRuLXJlc2V0LXNldHRpbmdzXCIpLmNsaWNrKCgpID0+IHtcclxuICAgIGxldCBuZXdTZXR0aW5ncyA9IGNvbnN0YW50cy5ERUZBVUxUX1NFVFRJTkdTO1xyXG4gICAgbG9nLmluZm8oXCJVSSByZXNldCBTZXR0aW5nczpcIiwgbmV3U2V0dGluZ3MpO1xyXG4gICAgXHJcbiAgICBmb3IgKHZhciBtZW1iZXIgaW4gc2V0dGluZ3MpIGRlbGV0ZSBzZXR0aW5nc1ttZW1iZXJdO1xyXG4gICAgXy5hc3NpZ24oc2V0dGluZ3MsIG5ld1NldHRpbmdzKTtcclxuICAgIFxyXG4gICAgJChcIiNUV0ZBUC10eHRhcmVhLXNldHRpbmdzXCIpLnZhbChKU09OLnN0cmluZ2lmeShzZXR0aW5ncykpO1xyXG4gIH0pO1xyXG4gIFxyXG4gIGFwcGVuZFRvdGFsUmVzQ29sKCk7XHJcbiAgXHJcbn0iLCJsZXQgJCA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93WyckJ10gOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsWyckJ10gOiBudWxsKTtcclxubGV0IF8gPSAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvd1snXyddIDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbFsnXyddIDogbnVsbCk7XHJcblxyXG5sZXQgU2V0dGluZ3MgPSByZXF1aXJlKFwiLi9zZXR0aW5nc1wiKTtcclxubGV0IG1pbmVyID0gcmVxdWlyZShcIi4vbWluZXJcIik7XHJcblxyXG5leHBvcnRzLm1heWJlUnVuRm5zID0gZnVuY3Rpb24gKGZucywgY2hhbmNlX29mX2V4ZWN1dGluZywgaW50ZXJ2YWwpIHtcclxuICBpbnRlcnZhbCA9IGludGVydmFsIHx8IDEwMDA7XHJcbiAgbGV0IGZuc19pbmRleCA9IDA7IFxyXG4gIFxyXG4gIGxldCBpbnRlcnZhbElEID1cclxuICAgIHNldEludGVydmFsKCAoKSA9PiB7XHJcbiAgICAgIGlmKGZuc19pbmRleCA+PSBmbnMubGVuZ3RoKSB7XHJcbiAgICAgICAgY2xlYXJJbnRlcnZhbChpbnRlcnZhbElEKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICAgIH0gZWxzZSBpZihfLnJhbmRvbSgwLCAxLCB0cnVlKSA8IGNoYW5jZV9vZl9leGVjdXRpbmcpIHtcclxuICAgICAgICBmbnNbZm5zX2luZGV4KytdKCk7XHJcbiAgICAgIH1cclxuICAgIH0sXHJcbiAgMTAwMCk7XHJcbn1cclxuXHJcbmV4cG9ydHMuaXNWYWxpZE9yZGVyTGV0dGVyID0gZnVuY3Rpb24gKG9yZGVyX2xldHRlcikge1xyXG4gIHRyeSB7XHJcbiAgICByZXR1cm4gdHlwZW9mIG9yZGVyX2xldHRlciA9PT0gXCJzdHJpbmdcIiAmJlxyXG4gICAgICBvcmRlcl9sZXR0ZXIubGVuZ3RoID09PSAxICYmXHJcbiAgICAgIC9bYXxifGNdL2kudGVzdChvcmRlcl9sZXR0ZXIpO1xyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICByZXR1cm4gZmFsc2U7XHJcbiAgfVxyXG59XHJcblxyXG5leHBvcnRzLmhhc0Vub3VnaFVuaXRzID0gZnVuY3Rpb24gKHVuaXRzKSB7XHJcbiAgbGV0IGN1cnJlbnRfdW5pdHMgPSBtaW5lci5taW5lQ3VycmVudFVuaXRzKCk7XHJcbiAgXHJcbiAgcmV0dXJuIF8uYWxsKF8ubWFwKF8ua2V5cyh1bml0cyksIGZ1bmN0aW9uKGspIHsgcmV0dXJuIGN1cnJlbnRfdW5pdHNba10gPj0gdW5pdHNba107IH0pKTtcclxufSJdfQ==
