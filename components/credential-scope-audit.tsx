export function CredentialScopeAudit() {
  return (
    <>
      <section className="credential-scope-audit" aria-labelledby="credential-scope-heading">
        <header className="credential-scope-header">
          <p className="credential-scope-kicker">Credential scope audit</p>
          <h2 id="credential-scope-heading">Default object storage credential permissions</h2>
        </header>

        <div className="credential-scope-notice" role="note">
          <p><strong>Reported scope profile:</strong> The object storage credential is described as granting read, write, and deletion privileges for stored assets, telemetry artifacts, and static backups. These permissions are user-provided and have not been independently verified by the app.</p>
        </div>

        <div className="credential-scope-list">
          <h3>Authorized scope list</h3>
          <p className="credential-scope-intro">Scopes reported for the Default object storage credential.</p>
          <ul>
            <li><code>storage:read</code><span>Permits reading and querying storage objects.</span></li>
            <li><strong>List &amp; download objects:</strong><span>Authorizes traversing bucket directories and retrieving file payloads.</span></li>
            <li><code>storage:write</code><span>Permits creating and updating files in the bucket.</span></li>
            <li><strong>Upload &amp; delete objects:</strong><span>Authorizes ingesting new assets and purging obsolete data.</span></li>
          </ul>
        </div>

        <footer className="credential-scope-footer">
          <span>Storage: Default object credential</span>
          <span className="credential-scope-status">Reported · not live-verified</span>
        </footer>
      </section>

      <section className="credential-scope-audit credential-scope-audit--database" aria-labelledby="database-credential-heading">
        <header className="credential-scope-header">
          <p className="credential-scope-kicker">Credential scope audit</p>
          <h2 id="database-credential-heading">Default Vector / Database Credential Permissions</h2>
        </header>

        <div className="credential-scope-notice credential-scope-notice--warning" role="note">
          <p><strong>Security Notice:</strong> Database and vector storage connections require strict schema isolation. Ensure table access is scoped explicitly to operational telemetry data rather than broad cluster-wide roles.</p>
        </div>

        <div className="credential-scope-list">
          <h3>Recommended Least-Privilege Practice</h3>
          <ul>
            <li><strong>Connection Pooling:</strong><span> Restrict database connectors to application-specific connection strings.</span></li>
            <li><strong>Credential Rotation:</strong><span> Periodically rotate database secrets to prevent stale tokens from retaining access to telemetry tables.</span></li>
          </ul>
        </div>

        <footer className="credential-scope-footer">
          <span>Database: Isolated Schema</span>
          <span className="credential-scope-status credential-scope-status--warning">Review Recommended</span>
        </footer>
      </section>

      <section className="credential-scope-audit credential-scope-audit--summary" aria-labelledby="privacy-audit-heading">
        <header className="credential-scope-header">
          <p className="credential-scope-kicker">Privacy &amp; pipeline audit: complete</p>
          <h2 id="privacy-audit-heading">Repository Hardening &amp; Path Sanitization</h2>
        </header>

        <div className="credential-scope-notice credential-scope-notice--success" role="note">
          <p><strong>Sanitization status:</strong> Branded public references were removed, the review page path is now <code>/secure-review.html</code>, and operational identifiers were preserved.</p>
        </div>

        <div className="credential-scope-list">
          <h3>Repository isolation summary</h3>
          <ul>
            <li><strong>Scoped identifiers:</strong><span> Organization references remain only in site-scope, OIDC audience, Cloudflare connector, and vault encryption contexts.</span></li>
            <li><strong>Routing &amp; sign-in:</strong><span> Generic sign-in copy is in place; the review page is available at <code>/secure-review.html</code>.</span></li>
            <li><strong>TypeScript &amp; diff checks:</strong><span> Passed before commit <code>54baa4f</code>.</span></li>
          </ul>
        </div>

        <footer className="credential-scope-footer">
          <span>Commit: 54baa4f</span>
          <span className="credential-scope-status">Privacy cleanup complete</span>
        </footer>
      </section>
    </>
  )
}
