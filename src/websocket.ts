import * as WebSocket from 'ws';
import * as http from 'http';

export async function createWebSocketServer(server: http.Server, initialPort: number = 3000): Promise<WebSocket.Server> {
  return new Promise((resolve, reject) => {
    const tryPort = (port: number) => {
      server.listen(port, () => {
        console.log(`WebSocket server is running on port ${port}`);
        resolve(new WebSocket.Server({ server }));
      }).on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          console.log(`Port ${port} is busy, trying ${port + 1}`);
          tryPort(port + 1);
        } else {
          reject(error);
        }
      });
    };

    tryPort(initialPort);
  });
}