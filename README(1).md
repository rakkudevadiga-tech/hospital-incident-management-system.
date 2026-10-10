# Hospital Incident Report & Resolution Management System

A starter hospital incident-reporting and resolution workflow built with **Google Apps Script, HTML/CSS/JavaScript, and Google Sheets**. Staff submit an incident through a separate web form. Authorized management uses a login-protected workspace to review reports, investigate causes, assign corrective actions, follow up, verify effectiveness, and close completed cases.

> **Important:** This is a configurable starter project, not a certified hospital information system or substitute for your hospital's approved incident-reporting, clinical escalation, privacy, security, and record-retention policies. Test it with non-sensitive sample data before use.

## Features

- Separate staff reporting page and management workspace.
- Automatically generated incident reference numbers.
- Google Sheets database with separate tabs for incidents, investigations, corrective actions, follow-ups, verifications, and audit log.
- Dashboard counts for total, pending, in-progress, and closed incidents, high/critical incidents, and overdue actions.
- Search and filters for incident text, status, severity, and demo/real records.
- Investigation, root-cause analysis, corrective-action assignment, follow-up, verification, and closure stages.
- Stage validation: an incident cannot advance out of order, and it cannot close unless corrective action and follow-up are completed and effectiveness is marked **Yes**.
- Pending/overdue-action list with a Continue button.
- Incident details and saved workflow history.
- Reports/analytics by department, incident type, severity, and workflow status.
- CSV export from the dashboard.
- Recent activity/audit log.
- Demo incident creation and removal for testing.
- Staff QR code and clickable reporting URL.
- Database connection test and management password change.

## Repository contents

| File | Purpose |
|---|---|
| `Code.gs` | Server-side Apps Script, authentication, Sheets database, workflow, audit activity, staff URL, and demo data. |
| `Index.html` | Management login, dashboard, workflow forms, analytics, QR/link, and owner settings. |
| `Staff.html` | Staff-facing incident reporting form. In Apps Script, create an HTML file named **Staff**; the editor displays it as `Staff.html`. |
| `LICENSE` | MIT License for the original project source in this repository. |
| `appsscript.json` | Suggested Apps Script V8 project manifest. |
| `README.md` | Setup, usage, security, and project documentation. |
| `.gitignore` | Excludes local credentials and generated files from Git. |

## Technology and architecture

- **Frontend:** HTML, CSS, JavaScript.
- **Backend:** Google Apps Script (`google.script.run` and server-side functions).
- **Database:** Google Sheets.
- **Staff route:** `/exec?page=staff`.
- **Management route:** `/exec`.
- **Workflow storage:** Each stage is appended to its corresponding sheet, preserving its saved history.

### Spreadsheet tabs

The `setupDatabase()` function creates or checks these tabs:

- `Incidents`
- `Investigations`
- `CorrectiveActions`
- `FollowUps`
- `Verifications`
- `AuditLog`

Run setup against the intended Apps Script project and spreadsheet. Back up existing records before changing the database structure.

## Installation in Google Apps Script

### Option A — Copy and paste

1. Open [Google Apps Script](https://script.google.com/) and create a project or open your existing project.
2. Open `Code.gs`, replace the contents with this repository's `Code.gs`, and save.
3. Ensure an HTML file named `Index` exists. Paste `Index.html` into it.
4. Create a new HTML file using **+ → HTML**, name it exactly `Staff`, and paste `Staff.html` into it. Do not create a second `doGet()` function.
5. In the function selector, choose `setupDatabase` and click **Run** once. Review and approve the requested Google permissions. The function initializes the database spreadsheet or checks the saved spreadsheet structure.
6. Open **Project Settings** and verify the project timezone matches your hospital's operating timezone.
7. Select **Deploy → New deployment → Web app**. For an existing deployment, use **Manage deployments → Edit → New version → Deploy**.
8. Configure **Execute as** and **Who has access** according to your organization's policies. Access settings affect whether staff can open the reporting form.
9. Open the deployed `/exec` URL to see the management login. The staff URL is the same deployed URL followed by `?page=staff`.
10. Log in, open **Owner Settings → Test database connection**, then open **Staff QR Code & Link**. Test the staff URL and QR on a phone.
11. Create demo incidents from Owner Settings and test the workflow. Remove demo incidents before preparing real reports or analytics.

### Option B — GitHub source

1. Create a GitHub repository.
2. Add `Code.gs`, `Index.html`, `Staff.html`, `README.md`, `LICENSE`, `appsscript.json`, and `.gitignore`.
3. Commit and push the files. GitHub stores and versions the source; it does not automatically deploy it as a Google Apps Script web app.
4. Copy the three application files into Apps Script manually, or use the `clasp` command-line tool if you are comfortable with it. Do not commit authentication tokens or private project configuration.

## First login and password setup

For this public source copy, `Code.gs` uses the temporary placeholder password:

`CHANGE_THIS_BEFORE_DEPLOYMENT`

Sign in with that temporary password immediately after deploying this source, then go to **Owner Settings → Change management password**. Use a strong, unique password and store it securely. Never publish a real password, token, spreadsheet URL containing sensitive information, or confidential deployment details in a public repository.

The password changed from the Owner Settings page is stored in Apps Script Script Properties. If you already deployed an earlier version using a different password, updating the source may change the fallback password for that project. Confirm the expected login before replacing a working deployment.

## Using the system

### Staff

1. Open the staff URL or scan its QR code.
2. Complete the required fields and submit the report.
3. Keep the generated incident ID for reference.

### Management

1. Sign in using the management password.
2. Use the dashboard to search/filter incidents and identify priority or overdue cases.
3. Select **Continue** to open the next required workflow stage.
4. Record investigation findings and root cause; set corrective action owner and due date; update follow-up; and verify effectiveness.
5. A case closes only after corrective action and follow-up are marked completed and verification effectiveness is **Yes**. If effectiveness is **No**, the incident remains open.
6. Use View to inspect available incident details and saved workflow history. Use CSV export for authorized reporting.

## Security, privacy, and operational limitations

- **Do not use this starter project with identifiable or sensitive patient information until your organization has reviewed and approved the security and privacy controls.** Avoid unnecessary names, patient IDs, diagnoses, contact details, and sensitive information in free-text fields.
- The staff form intentionally allows reporting without a management session. If the deployment is accessible to anyone with the URL, anyone who obtains it may submit reports. Use restricted organizational access when practical and appropriate. The QR code is a link, not an access-control mechanism.
- Management functions check a cached six-hour session token. This is a basic application control, not a substitute for Google Workspace account access controls or a formal security review.
- The QR image is generated using an external QR-image service. Its availability and privacy/terms are separate from this source code. The staff URL remains available as text if the image fails to load.
- No email, SMS, WhatsApp, or automatic escalation notification is configured in this version.
- Google Apps Script quotas, execution time limits, and Sheets size/performance limits apply. Larger deployments may need a dedicated database and a more formal application architecture.
- The audit log is an application-level activity record, not a tamper-proof audit trail.
- Demo data is for test purposes only. Remove it before using dashboard statistics for operational reporting.
- After code changes, save and deploy a **new version** for the live `/exec` URL.

## Test checklist

- [ ] Management login succeeds.
- [ ] Database connection succeeds and all six sheets exist.
- [ ] Staff URL displays the staff form only.
- [ ] Staff can submit a sample report and receive an incident ID.
- [ ] The incident appears on the management dashboard.
- [ ] A new incident begins as Pending / Investigation.
- [ ] Investigation save moves the case to Corrective Action.
- [ ] Pending or In Progress corrective action remains open; Completed moves it to Follow-up.
- [ ] Pending or In Progress follow-up remains open; Completed moves it to Verification & Closure.
- [ ] Verification set to No keeps the incident open.
- [ ] Verification set to Yes closes only after corrective action and follow-up are Completed.
- [ ] Search, filters, View, Continue, analytics, CSV export, and activity log work.
- [ ] Demo data has been removed before operational reporting.
- [ ] Staff access and management protection have been reviewed by the organization.

## License

This repository's original source code is released under the **MIT License**. See [`LICENSE`](LICENSE) for the exact terms. The MIT License permits use, modification, distribution, sublicensing, and commercial use, provided the copyright and permission notice are included.

The license for this repository does not change the terms of Google Apps Script, Google Sheets, or third-party services used by the application. Make sure you have the right to publish any separately added logos, images, hospital branding, or other third-party assets.

## Disclaimer

The software is provided for educational and prototyping purposes on an “AS IS” basis, without warranties. The deploying organization is responsible for validating the workflow, security, access permissions, regulatory requirements, data protection, backup, retention, and operational suitability before use.
