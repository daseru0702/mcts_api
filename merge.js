// merge.js
// self-play된 .ndjson 파일을 .json으로 변환하기 위해 사용합니다. 
import fs from 'fs';

// 1) 합친 ndjson 파일 읽기
const lines = fs.readFileSync('data/quoridor_selfplay.ndjson', 'utf8')
               .split('\n')
               .filter(l => l.trim());

// 2) 파싱해서 배열로 분리
const states   = [];
const policies = [];
const values   = [];
for (const l of lines) {
  const { state, pi, z } = JSON.parse(l);
  states.push(state);
  policies.push(pi);
  values.push(z != null ? z : 0);
}

// 3) 하나의 JSON으로 쓰기
const out = { states, policies, values };
fs.writeFileSync('data/quoridor_selfplay.json', JSON.stringify(out));
console.log('✅ data/quoridor_selfplay.json 생성 완료');
