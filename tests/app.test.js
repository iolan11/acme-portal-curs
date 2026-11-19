process.env.NODE_ENV = 'test';
process.env.API_TOKEN = 'demo-token-canvia-ho';

const request = require('supertest');
const { createApp } = require('../src/app');

const app = createApp();
const auth = { Authorization: 'Bearer demo-token-canvia-ho' };

describe('ACME Portal', () => {
  test('health OK', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('clients exigeix auth', async () => {
    const res = await request(app).get('/api/clients');
    expect(res.status).toBe(401);
  });

  test('clients amb token retorna llista', async () => {
    const res = await request(app).get('/api/clients').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  test('contacte normal crea ticket', async () => {
    const res = await request(app)
      .post('/api/contact')
      .send({ name: 'A', email: 'a@t.com', message: 'hola' });
    expect(res.status).toBe(201);
    expect(res.body.ticketId).toMatch(/^T-/);
  });

  test('contacte amb urgent crea ticket', async () => {
    const res = await request(app)
      .post('/api/contact')
      .send({ name: 'A', email: 'a@t.com', message: 'cas urgent siusplau' });
    expect(res.status).toBe(201);
    expect(res.body.ticketId).toMatch(/^T-/);
  });

  test('invitació duplicada seqüencial retorna 409 amb el mateix token', async () => {
    const email = 'seq-dup@t.com';
    const first = await request(app)
      .post('/api/invitations')
      .set(auth)
      .send({ email });
    expect(first.status).toBe(201);
    expect(first.body.token).toMatch(/^inv_/);

    const second = await request(app)
      .post('/api/invitations')
      .set(auth)
      .send({ email });
    expect(second.status).toBe(409);
    expect(second.body.token).toBe(first.body.token);
  });

  test('invitacions concurrents amb el mateix email no creen dos tokens', async () => {
    const email = 'race@t.com';
    const [a, b] = await Promise.all([
      request(app).post('/api/invitations').set(auth).send({ email }),
      request(app).post('/api/invitations').set(auth).send({ email }),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);
    expect(a.body.token).toBe(b.body.token);
    expect(a.body.token).toMatch(/^inv_/);
  });
});
