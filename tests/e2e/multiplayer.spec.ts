import { test, expect } from '@playwright/test';

test('two independent browser contexts share movement and chat in one room', async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  await Promise.all([pageA.goto('/'), pageB.goto('/')]);

  const connect = async (page: typeof pageA, nickname: string) => page.evaluate(async (name) => {
    const socket = new WebSocket(`ws://${location.hostname}:3000/ws`);
    (window as any).__e2eSocket = socket;
    const messages: any[] = [];
    (window as any).__e2eMessages = messages;
    socket.addEventListener('message', (event) => { if (typeof event.data === 'string') messages.push(JSON.parse(event.data)); });
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener('open', () => resolve(), { once: true });
      socket.addEventListener('error', () => reject(new Error('WebSocket connection failed')), { once: true });
    });
    socket.send(JSON.stringify({ type: 'join', roomId: 'normal', nickname: name, protocol: 'json' }));
    await new Promise<void>((resolve, reject) => {
      const started = Date.now();
      const poll = () => {
        if (messages.some((message) => message.type === 'joined')) resolve();
        else if (Date.now() - started > 5000) reject(new Error('join timeout'));
        else setTimeout(poll, 25);
      }; poll();
    });
  }, nickname);

  await connect(pageA, 'E2E-A');
  await connect(pageB, 'E2E-B');
  const before = await pageB.evaluate(() => (window as any).__e2eMessages.find((message: any) => message.type === 'room:update')?.room?.players?.find((player: any) => player.nickname === 'E2E-A')?.state?.x ?? (window as any).__e2eMessages.find((message: any) => message.type === 'joined')?.room?.players?.find((player: any) => player.nickname === 'E2E-A')?.state?.x);
  expect(typeof before).toBe('number');
  await pageA.evaluate(() => (window as any).__e2eSocket.send(JSON.stringify({ type: 'chat', text: 'hello-from-e2e' })));
  await expect.poll(() => pageB.evaluate(() => (window as any).__e2eMessages.some((message: any) => message.type === 'chat' && message.text === 'hello-from-e2e'))).toBe(true);
  await pageA.evaluate(() => (window as any).__e2eSocket.send(JSON.stringify({ type: 'input', input: { seq: 1, throttle: 1, turn: 0, fire: false } })));
  await expect.poll(() => pageB.evaluate((initial) => (window as any).__e2eMessages.some((message: any) => message.type === 'snapshot' && message.players.some((player: any) => player.nickname === 'E2E-A' && player.state.x !== initial)), before), { timeout: 8000 }).toBe(true);
  await pageA.evaluate(() => (window as any).__e2eSocket.close());
  await pageB.evaluate(() => (window as any).__e2eSocket.close());
  await contextA.close(); await contextB.close();
});
