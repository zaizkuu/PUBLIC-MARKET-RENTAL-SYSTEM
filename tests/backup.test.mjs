import test from 'node:test';
import assert from 'node:assert/strict';
import { backupRecords } from '../src/backup.ts';
const records=()=>({applicants:[],tenants:[],stalls:[],logs:[],activities:[],officers:[],utilities:[],violations:[],verifications:[]});
test('accepts direct backups and exported report data without changing records',()=>{const state=records();assert.equal(backupRecords(state),state);assert.equal(backupRecords({generatedAt:'test',summary:{},data:state}),state);});
test('rejects missing record lists and malformed rows rather than replacing data',()=>{assert.throws(()=>backupRecords({summary:{}}),/system backup/);assert.throws(()=>backupRecords({...records(),tenants:{}}),/tenants/);assert.throws(()=>backupRecords({...records(),stalls:[null]}),/invalid records/);assert.throws(()=>backupRecords({...records(),utilities:'invalid'}),/utilities/);});