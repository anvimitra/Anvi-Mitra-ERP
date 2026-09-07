async function auditSecurity(pool, req, action, entityType = null, entityId = null, metadata = {}) {
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO security_audit_logs
       (school_id,user_id,action,entity_type,entity_id,request_id,ip_address,user_agent,metadata)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        req.auth?.schoolId || null,
        req.auth?.sub || null,
        action,
        entityType,
        entityId || null,
        req.requestId || null,
        req.ip || null,
        String(req.get?.('user-agent') || '').slice(0, 1000),
        JSON.stringify(metadata || {})
      ]
    );
  } catch (error) {
    console.error('Security audit write failed:', error.message);
  }
}

module.exports = { auditSecurity };
