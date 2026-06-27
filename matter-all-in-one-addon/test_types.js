import * as clusters from 'matterbridge/matter/clusters';
console.log("Clusters available:");
console.log(Object.keys(clusters).filter(k => k.toLowerCase().includes('fan')));

