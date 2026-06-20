import fs from 'fs';
const data = fs.readFileSync('/data/exported-devices.json', 'utf8');
console.log(data);
