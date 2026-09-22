// Integration & Safety — token auth (kept deliberately simple).
// A single shared bearer token guards telemetry ingest. Viewers (the dashboard)
// are read-only and open by default; set REQUIRE_VIEWER_AUTH=1 to lock them too.

function tokenFromReq(req) {
  const h = req.headers['authorization'] || '';
  if (h.startsWith('Bearer ')) return h.slice(7).trim();
  return req.query.token || null;
}

function restAuth(cfg) {
  return (req, res, next) => {
    if (!cfg.API_TOKEN) return next();            // auth disabled
    if (tokenFromReq(req) === cfg.API_TOKEN) return next();
    return res.status(401).json({ error: 'unauthorized' });
  };
}

function socketToken(socket) {
  return (socket.handshake.auth && socket.handshake.auth.token)
    || (socket.handshake.query && socket.handshake.query.token)
    || null;
}

function socketConnectAuth(cfg) {
  return (socket, next) => {
    if (!cfg.API_TOKEN || !cfg.REQUIRE_VIEWER_AUTH) return next(); // viewers open
    if (socketToken(socket) === cfg.API_TOKEN) return next();
    return next(new Error('unauthorized'));
  };
}

// A producer may only push telemetry over a socket if it presents the token.
function socketCanIngest(cfg, socket) {
  if (!cfg.API_TOKEN) return true;
  return socketToken(socket) === cfg.API_TOKEN;
}

module.exports = { restAuth, socketConnectAuth, socketCanIngest, tokenFromReq };
