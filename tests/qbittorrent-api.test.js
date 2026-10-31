'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { getQbitSeedingParameterName } = require('../app/qbittorrent-api');

test('qBittorrent WebAPI before 2.16 uses skip_checking', () => {
  for (const version of ['2.8.0', '2.9.3', '2.15.4', '2.15.99']) {
    assert.equal(getQbitSeedingParameterName(version), 'skip_checking', version);
  }
});

test('qBittorrent WebAPI 2.16 and newer uses seedMode', () => {
  for (const version of ['2.16.0', '2.16.1', '2.17.0', '3.0.0']) {
    assert.equal(getQbitSeedingParameterName(version), 'seedMode', version);
  }
});

test('trims whitespace from API responses', () => {
  assert.equal(getQbitSeedingParameterName(' 2.16.0\n'), 'seedMode');
});

test('fails visibly if the API version cannot be identified', () => {
  for (const version of ['', 'unknown', '5.3.0-application', '2.invalid']) {
    assert.throws(() => getQbitSeedingParameterName(version), /Versione WebAPI qBittorrent non riconosciuta/);
  }
});
