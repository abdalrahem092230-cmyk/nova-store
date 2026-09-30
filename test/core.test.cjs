const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../app/src/main/assets/core.js');
test('points reflect hints and mistakes and have a 10 point floor', () => {
  assert.equal(core.points(0, false), 100);
  assert.equal(core.points(1, true), 50);
  assert.equal(core.points(100, true), 10);
});
test('maze blocks walls, row wrap and out of range moves', () => {
  assert.equal(core.canMove(0, -1), false);
  assert.equal(core.canMove(0, 4), false);
  assert.equal(core.canMove(11, 1), false);
  assert.equal(core.canMove(15, 4), false);
  assert.equal(core.canMove(0, 2), false);
});
test('maze has a valid six move solution', () => {
  let pos=0;
  for (const d of [1,4,4,1,1,4]) { assert(core.canMove(pos,d)); pos+=d; }
  assert.equal(pos, 15);
});
test('valid progress survives restoring and corrupt progress resets safely', () => {
  const state={...core.defaults(),level:5,score:400,lang:'ar',pos:9,path:[0,1,5,9],moves:3};
  assert.deepEqual(core.validate(JSON.parse(JSON.stringify(state))),state);
  for(const corrupt of [{...state,level:999},{...state,pos:2},{...state,path:[0,9]},{...state,order:['A','A']},{...state,complete:true},{...state,solved:'yes'}]) assert.deepEqual(core.validate(corrupt),core.defaults());
});
