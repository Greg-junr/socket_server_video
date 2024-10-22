import * as mediasoup from 'mediasoup';

export class MediaSoupService {
  private static instance: MediaSoupService;
  private worker!: mediasoup.types.Worker;

  private constructor() {}

  public static getInstance(): MediaSoupService {
    if (!MediaSoupService.instance) {
      MediaSoupService.instance = new MediaSoupService();
    }
    return MediaSoupService.instance;
  }

  async initializeWorker() {
    this.worker = await mediasoup.createWorker({
      logLevel: 'warn',
      rtcMinPort: 10000,
      rtcMaxPort: 10100,
    });
    console.log('mediasoup worker created');
    return this.worker;
  }

  getWorker() {
    return this.worker;
  }
}