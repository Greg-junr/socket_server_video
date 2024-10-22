import * as mediasoup from 'mediasoup';

let worker: mediasoup.types.Worker;

export async function initializeWorker() {
  worker = await mediasoup.createWorker({
    logLevel: 'warn',
    rtcMinPort: 10000,
    rtcMaxPort: 10100,
  });
  console.log('mediasoup worker created');
  return worker;
}

export function getWorker() {
  return worker;
}