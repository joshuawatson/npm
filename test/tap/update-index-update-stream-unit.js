'use strict'

var common = require('../common-tap.js')
var npm = require('../../')
var test = require('tap').test
var mkdirp = require('mkdirp')
var rimraf = require('rimraf')
var path = require('path')
var mr = require('npm-registry-mock')
var ms = require('mississippi')
var Tacks = require('tacks')
var File = Tacks.File

var _createEntryUpdateStream = require('../../lib/cache/update-index.js')._createEntryUpdateStream

var ALL = common.registry + '/-/all'
var PKG_DIR = path.resolve(__dirname, 'create-entry-update-stream')
var CACHE_DIR = path.resolve(PKG_DIR, 'cache')

var server

function setup () {
  mkdirp.sync(CACHE_DIR)
}

function cleanup () {
  rimraf.sync(PKG_DIR)
}

test('setup', function (t) {
  mr({port: common.port, throwOnUnmatched: true}, function (err, s) {
    t.ifError(err, 'registry mocked successfully')
    npm.load({ cache: CACHE_DIR, registry: common.registry }, function (err) {
      t.ifError(err, 'npm loaded successfully')
      server = s
      t.done()
    })
  })
})

test('createEntryUpdateStream full request', function (t) {
  setup()
  server.get('/-/all').once().reply(200, {
    '_updated': 1234,
    'bar': { name: 'bar', version: '1.0.0' },
    'foo': { name: 'foo', version: '1.0.0' }
  }, {
    date: Date.now() // should never be used.
  })
  _createEntryUpdateStream(ALL, {}, 600, 0, function (err, stream, latest) {
    if (err) throw err
    t.equals(latest, 1234, '`latest` correctly extracted')
    t.ok(stream, 'returned a stream')
    var results = []
    stream.on('data', function (pkg) {
      results.push(pkg)
    })
    ms.finished(stream, function (err) {
      if (err) throw err
      t.deepEquals(results, [{
        name: 'bar',
        version: '1.0.0'
      }, {
        name: 'foo',
        version: '1.0.0'
      }])
      cleanup()
      server.done()
      t.done()
    })
  })
})

test('createEntryUpdateStream partial update', function (t) {
  setup()
  var now = Date.now()
  server.get('/-/all/since?stale=update_after&startkey=1234').once().reply(200, {
    'bar': { name: 'bar', version: '1.0.0' },
    'foo': { name: 'foo', version: '1.0.0' }
  }, {
    date: (new Date(now)).toISOString()
  })
  _createEntryUpdateStream(ALL, {}, 600, 1234, function (err, stream, latest) {
    if (err) throw err
    t.equals(latest, now, '`latest` correctly extracted from header')
    t.ok(stream, 'returned a stream')
    var results = []
    stream.on('data', function (pkg) {
      results.push(pkg)
    })
    ms.finished(stream, function (err) {
      if (err) throw err
      t.deepEquals(results, [{
        name: 'bar',
        version: '1.0.0'
      }, {
        name: 'foo',
        version: '1.0.0'
      }])
      cleanup()
      server.done()
      t.done()
    })
  })
})

test('cleanup', function (t) {
  cleanup()
  server.close()
  t.done()
})
