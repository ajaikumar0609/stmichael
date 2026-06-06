const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

function withCors(fn) {
  return async (req, res) => {
    Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    try {
      await fn(req, res);
    } catch (err) {
      if (err.status === 401 || err.message === 'No token') {
        res.status(401).json({ error: 'Unauthorized' }); return;
      }
      if (err.status === 403) {
        res.status(403).json({ error: 'Forbidden — insufficient role' }); return;
      }
      if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
        res.status(401).json({ error: 'Unauthorized' }); return;
      }
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

module.exports = { withCors };
