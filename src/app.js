const path = require('path');
const express = require('express');
const cors = require('cors');
const { requireAuth } = require('./auth');
const {
  getClientsFast,
  invitations,
  delay,
} = require('./db');

function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'acme-portal' });
  });

  /** Panell admin: lent a propòsit */
  app.get('/api/clients', requireAuth, async (_req, res) => {
    const data = await getClientsFast();
    res.json({ data, meta: { count: data.length, note: 'endpoint lent (lab)' } });
  });

  /**
   * Formulari de contacte.
   */
  app.post('/api/contact', (req, res) => {
    const { name, email, message } = req.body || {};

    if (!name || !email || !message) {
      return res.status(400).json({ error: 'Cal name, email i message' });
    }

    return res.status(201).json({
      ok: true,
      ticketId: `T-${Date.now()}`,
      received: { name, email },
    });
  });

  /** Promeses en curs per email: evita crear dos tokens en POST concurrents. */
  const pendingInvitations = new Map();

  /**
   * Invitacions: un sol token per email (409 si ja existeix o si un altre POST el crea).
   */
  app.post('/api/invitations', requireAuth, async (req, res) => {
    const email = (req.body && req.body.email) || '';
    if (!email.includes('@')) {
      return res.status(400).json({ error: 'Email invàlid' });
    }

    const existing = invitations.get(email);
    if (existing) {
      return res.status(409).json({
        error: 'Ja existeix una invitació per aquest email',
        email,
        token: existing.token,
      });
    }

    let isLeader = false;
    let createPromise = pendingInvitations.get(email);
    if (!createPromise) {
      isLeader = true;
      createPromise = (async () => {
        // Simula latència de xarxa / BD
        await delay(150);
        await delay(150);
        const again = invitations.get(email);
        if (again) return again;
        const token = `inv_${Math.random().toString(36).slice(2)}_${Date.now()}`;
        const row = { token, createdAt: Date.now() };
        invitations.set(email, row);
        return row;
      })().finally(() => {
        pendingInvitations.delete(email);
      });
      pendingInvitations.set(email, createPromise);
    }

    const row = await createPromise;
    if (isLeader) {
      return res.status(201).json({ email, token: row.token });
    }
    return res.status(409).json({
      error: 'Ja existeix una invitació per aquest email',
      email,
      token: row.token,
    });
  });

  app.get('/api/invitations/:email', requireAuth, (req, res) => {
    const row = invitations.get(req.params.email);
    if (!row) return res.status(404).json({ error: 'No trobat' });
    return res.json(row);
  });

  return app;
}

module.exports = { createApp };
