/**************** HOSPITAL INCIDENT REPORT & RESOLUTION MANAGEMENT ****************
 * Apps Script files required: Code.gs, Index.html, Staff.html
 * Run setupDatabase() once, then deploy as a Web App.
 * Default management password remains HospitalAdmin@2026 unless changed in settings.
 ******************************************************************************/
const MANAGEMENT_PASSWORD = 'CHANGE_THIS_BEFORE_DEPLOYMENT';
const DB_PROPERTY = 'HOSPITAL_INCIDENT_DB_ID';
const PASSWORD_PROPERTY = 'HOSPITAL_INCIDENT_MANAGEMENT_PASSWORD';
const SESSION_PREFIX = 'hospital_manager_';
const SESSION_SECONDS = 21600; // 6 hours

const HEADERS = {
  Incidents: ['IncidentID','CreatedAt','ReporterName','ReporterRole','Department','IncidentDate','IncidentTime','IncidentType','Location','Severity','InjuryOrHarm','Description','ImmediateAction','Status','CurrentStage','IsDemo'],
  Investigations: ['IncidentID','SavedAt','Investigator','InvestigationDate','Findings','RootCause','ContributingFactors'],
  CorrectiveActions: ['IncidentID','SavedAt','ActionDescription','ResponsiblePerson','DueDate','ActionStatus','CompletionNotes'],
  FollowUps: ['IncidentID','SavedAt','FollowUpDate','FollowUpBy','Progress','NextReviewDate','FollowUpStatus'],
  Verifications: ['IncidentID','SavedAt','VerifiedBy','VerificationDate','Effective','ClosureNotes'],
  AuditLog: ['Timestamp','Actor','Action','IncidentID','Details']
};

function doGet(e) {
  const page = String(e && e.parameter && e.parameter.page || '').toLowerCase();
  const staff = page === 'staff';
  return HtmlService.createHtmlOutputFromFile(staff ? 'Staff' : 'Index')
    .setTitle(staff ? 'Hospital Incident Reporting' : 'Hospital Incident Management')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function setupDatabase() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty(DB_PROPERTY);
  let ss;
  if (id) {
    try { ss = SpreadsheetApp.openById(id); }
    catch (err) { throw new Error('The saved database spreadsheet cannot be opened. Check access or clear the HOSPITAL_INCIDENT_DB_ID script property and run setupDatabase() again. Details: ' + err.message); }
  } else {
    ss = SpreadsheetApp.create('Hospital Incident Management Database');
    id = ss.getId();
    props.setProperty(DB_PROPERTY, id);
  }

  Object.keys(HEADERS).forEach(name => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (sh.getLastRow() === 0 || sh.getLastColumn() === 0) {
      sh.getRange(1,1,1,HEADERS[name].length).setValues([HEADERS[name]]);
      sh.setFrozenRows(1);
      sh.getRange(1,1,1,HEADERS[name].length).setFontWeight('bold').setBackground('#dbeafe');
      sh.autoResizeColumns(1, HEADERS[name].length);
      return;
    }
    const current = sh.getRange(1,1,1,Math.max(sh.getLastColumn(), HEADERS[name].length)).getValues()[0].map(String);
    const expected = HEADERS[name];
    const existingHeaders = current.filter(v => v !== '');
    const isExpectedPrefix = expected.slice(0, existingHeaders.length).every((h, i) => existingHeaders[i] === h);
    const exactExisting = existingHeaders.length === expected.length && expected.every((h,i) => existingHeaders[i] === h);
    if (exactExisting) return;
    // Safe extension: if an older version lacks only newly added trailing columns, add them without clearing data.
    const compatible = existingHeaders.length <= expected.length && existingHeaders.every((h,i) => expected[i] === h);
    if (compatible) {
      const missing = expected.slice(existingHeaders.length);
      if (missing.length) sh.getRange(1, existingHeaders.length + 1, 1, missing.length).setValues([missing]);
      sh.setFrozenRows(1);
      sh.getRange(1,1,1,expected.length).setFontWeight('bold').setBackground('#dbeafe');
      return;
    }
    throw new Error('Header mismatch in sheet "' + name + '". Row 1 must match this version. No data was deleted. Check the sheet before running setupDatabase again.');
  });

  const defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > Object.keys(HEADERS).length && defaultSheet.getLastRow() <= 1 && defaultSheet.getLastColumn() <= 1 && !String(defaultSheet.getRange(1,1).getDisplayValue()).trim()) ss.deleteSheet(defaultSheet);
  return {success:true, message:'Database ready', spreadsheetUrl:ss.getUrl(), spreadsheetName:ss.getName()};
}

function testConnection() { return {success:true,message:'Backend is working'}; }
function db_() {
  const id = PropertiesService.getScriptProperties().getProperty(DB_PROPERTY);
  if (!id) throw new Error('Database not initialized. Open Apps Script, select setupDatabase, and click Run once.');
  return SpreadsheetApp.openById(id);
}
function sheet_(name) {
  const sh = db_().getSheetByName(name);
  if (!sh) throw new Error('Missing sheet: ' + name + '. Run setupDatabase() first.');
  return sh;
}
function currentPassword_() { return PropertiesService.getScriptProperties().getProperty(PASSWORD_PROPERTY) || MANAGEMENT_PASSWORD; }
function authenticateManagement(password) {
  if (String(password || '').trim() !== currentPassword_()) throw new Error('Incorrect management password. Check the password and try again.');
  const token = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put(SESSION_PREFIX + token, 'authorized', SESSION_SECONDS);
  return {success:true, token:token, expiresInSeconds:SESSION_SECONDS};
}
function checkManager_(token) {
  if (!token || CacheService.getScriptCache().get(SESSION_PREFIX + token) !== 'authorized') throw new Error('Management session expired. Please log in again.');
}
function logoutManagement(token) {
  if (token) CacheService.getScriptCache().remove(SESSION_PREFIX + token);
  return {success:true};
}
function changeManagementPassword(token, currentPassword, newPassword) {
  checkManager_(token);
  if (String(currentPassword || '') !== currentPassword_()) throw new Error('Current password is incorrect.');
  const next = String(newPassword || '');
  if (next.length < 10) throw new Error('Use at least 10 characters for the new password.');
  if (!/[A-Za-z]/.test(next) || !/[0-9]/.test(next)) throw new Error('Use a mix of letters and numbers.');
  PropertiesService.getScriptProperties().setProperty(PASSWORD_PROPERTY, next);
  logAudit_('Management','Password changed','', 'Management password updated in Script Properties.');
  return {success:true,message:'Management password updated. Use the new password at the next login.'};
}

function cleanText_(value) {
  let s = value == null ? '' : String(value).trim();
  if (/^[=+@\-]/.test(s)) s = "'" + s; // avoid spreadsheet formula injection
  return s;
}
function validateText_(data, keys) {
  keys.forEach(k => { if (!String(data[k] || '').trim()) throw new Error('Please complete the required field: ' + k); });
}
function saveIncident(data, managementData) {
  // Staff call: saveIncident(formObject). Management call: saveIncident(token, formObject).
  let actor = 'Staff';
  if (managementData !== undefined) { checkManager_(data); data = managementData; actor = 'Management'; }
  data = data || {};
  validateText_(data, ['ReporterName','Department','IncidentDate','IncidentType','Severity','Description']);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const id = 'INC-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss') + '-' + Utilities.getUuid().slice(0,6).toUpperCase();
    appendObject_(sheet_('Incidents'), {
      IncidentID:id, CreatedAt:new Date(), ReporterName:cleanText_(data.ReporterName), ReporterRole:cleanText_(data.ReporterRole),
      Department:cleanText_(data.Department), IncidentDate:cleanText_(data.IncidentDate), IncidentTime:cleanText_(data.IncidentTime),
      IncidentType:cleanText_(data.IncidentType), Location:cleanText_(data.Location), Severity:cleanText_(data.Severity),
      InjuryOrHarm:cleanText_(data.InjuryOrHarm || 'Unknown'), Description:cleanText_(data.Description),
      ImmediateAction:cleanText_(data.ImmediateAction), Status:'Pending', CurrentStage:'Investigation', IsDemo:'No'
    });
    logAudit_(actor, 'Incident reported', id, 'New ' + cleanText_(data.IncidentType) + ' incident reported in ' + cleanText_(data.Department) + '.');
    return {success:true, incidentId:id, status:'Pending', nextStage:'Investigation'};
  } finally { lock.releaseLock(); }
}

function readObjects_(sheetName) {
  const values = sheet_(sheetName).getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1).filter(row => row.some(v => v !== '' && v !== null)).map(row => {
    const obj = {};
    headers.forEach((h,i) => {
      const v = row[i];
      obj[h] = v instanceof Date ? Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss") : v;
    });
    return obj;
  });
}
function appendObject_(sh, obj) {
  const n = sh.getLastColumn();
  if (!n) throw new Error('Sheet ' + sh.getName() + ' has no header row. Run setupDatabase().');
  const headers = sh.getRange(1,1,1,n).getValues()[0];
  sh.appendRow(headers.map(h => obj[h] === undefined ? '' : obj[h]));
}
function latest_(rows) { return rows && rows.length ? rows[rows.length - 1] : null; }
function rowsFor_(name,id) { return readObjects_(name).filter(r => String(r.IncidentID) === String(id)); }
function findIncident_(id) { return readObjects_('Incidents').find(r => String(r.IncidentID) === String(id)); }
function groupRows_(rows) {
  const out = {};
  rows.forEach(r => { const k = String(r.IncidentID); (out[k] = out[k] || []).push(r); });
  return out;
}
function stateFromRows_(id, maps) {
  const inv = maps.investigations[String(id)] || [], ca = maps.corrective[String(id)] || [], fu = maps.followup[String(id)] || [], ver = maps.verification[String(id)] || [];
  const lastCA = latest_(ca), lastFU = latest_(fu), lastVER = latest_(ver);
  if (lastVER && String(lastVER.Effective) === 'Yes' && lastCA && String(lastCA.ActionStatus) === 'Completed' && lastFU && String(lastFU.FollowUpStatus) === 'Completed') return {status:'Closed',nextStage:'Closed'};
  if (!inv.length) return {status:'Pending',nextStage:'Investigation'};
  if (!lastCA || String(lastCA.ActionStatus) !== 'Completed') return {status:'In Progress',nextStage:'Corrective Action'};
  if (!lastFU || String(lastFU.FollowUpStatus) !== 'Completed') return {status:'In Progress',nextStage:'Follow-up'};
  return {status:'In Progress',nextStage:'Verification & Closure'};
}
function workflowState_(id) {
  return stateFromRows_(id, {investigations:groupRows_(rowsFor_('Investigations',id)),corrective:groupRows_(rowsFor_('CorrectiveActions',id)),followup:groupRows_(rowsFor_('FollowUps',id)),verification:groupRows_(rowsFor_('Verifications',id))});
}
function updateIncident_(id,status,stage) {
  const sh = sheet_('Incidents'), values = sh.getDataRange().getValues();
  if (!values.length) throw new Error('Incident sheet has no headers.');
  const headers = values[0], idCol = headers.indexOf('IncidentID'), statusCol = headers.indexOf('Status'), stageCol = headers.indexOf('CurrentStage');
  if ([idCol,statusCol,stageCol].some(c => c < 0)) throw new Error('Missing incident status headers.');
  for (let i=1;i<values.length;i++) if (String(values[i][idCol]) === String(id)) { sh.getRange(i+1,statusCol+1).setValue(status); sh.getRange(i+1,stageCol+1).setValue(stage); return; }
  throw new Error('Incident not found: ' + id);
}
function logAudit_(actor, action, id, details) {
  try { appendObject_(sheet_('AuditLog'), {Timestamp:new Date(),Actor:actor || 'System',Action:action || '',IncidentID:id || '',Details:details || ''}); } catch (err) { console.warn('Audit log write failed: ' + err.message); }
}

function getDashboardData(token) {
  checkManager_(token);
  const incidents = readObjects_('Incidents');
  const maps = {investigations:groupRows_(readObjects_('Investigations')),corrective:groupRows_(readObjects_('CorrectiveActions')),followup:groupRows_(readObjects_('FollowUps')),verification:groupRows_(readObjects_('Verifications'))};
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  let pending=0, inProgress=0, closed=0, highRisk=0, overdueCount=0;
  const pendingActions=[];
  incidents.forEach(i => {
    const state = stateFromRows_(i.IncidentID,maps);
    i.Status=state.status; i.CurrentStage=state.nextStage;
    i.IsDemo=String(i.IsDemo)==='Yes'?'Yes':'No';
    if (state.status==='Pending') pending++; else if(state.status==='Closed') closed++; else inProgress++;
    if (['High','Critical'].includes(String(i.Severity))) highRisk++;
    if (state.status!=='Closed') {
      let dueDate='', responsible='';
      if (state.nextStage==='Corrective Action') { const ca=latest_(maps.corrective[String(i.IncidentID)]||[]); if(ca){dueDate=ca.DueDate||'';responsible=ca.ResponsiblePerson||'';} }
      else if (state.nextStage==='Follow-up' || state.nextStage==='Verification & Closure') { const fu=latest_(maps.followup[String(i.IncidentID)]||[]); if(fu){dueDate=fu.NextReviewDate||'';responsible=fu.FollowUpBy||'';} }
      const due=String(dueDate||'').slice(0,10), overdue=!!due && /^\d{4}-\d{2}-\d{2}$/.test(due) && due<today;
      if(overdue) overdueCount++;
      pendingActions.push({IncidentID:i.IncidentID,Department:i.Department,Status:state.status,CurrentStage:state.nextStage,ResponsiblePerson:responsible,DueDate:due,Overdue:overdue,Severity:i.Severity,IsDemo:i.IsDemo});
    }
  });
  pendingActions.sort((a,b) => (b.Overdue-a.Overdue) || String(a.DueDate).localeCompare(String(b.DueDate)));
  return {total:incidents.length,pending:pending,inProgress:inProgress,closed:closed,highRisk:highRisk,overdueCount:overdueCount,incidents:incidents,pendingActions:pendingActions,demoIncluded:true,recentActivity:readObjects_('AuditLog').slice(-12).reverse()};
}
function getIncidentBundle(token,id) {
  checkManager_(token);
  const incident=findIncident_(id);
  if(!incident) throw new Error('Incident not found. Check the incident ID and try again.');
  const state=workflowState_(id);
  return {incident:incident,status:state.status,nextStage:state.nextStage,investigations:rowsFor_('Investigations',id),correctiveActions:rowsFor_('CorrectiveActions',id),followUps:rowsFor_('FollowUps',id),verifications:rowsFor_('Verifications',id)};
}
function saveWorkflow(token,data) {
  checkManager_(token);
  if(!data||!data.IncidentID||!data.Stage) throw new Error('Incident ID and workflow stage are required.');
  const id=String(data.IncidentID), incident=findIncident_(id);
  if(!incident) throw new Error('Incident not found: '+id);
  const state=workflowState_(id);
  if(state.nextStage==='Closed') throw new Error('This incident is already closed.');
  const stage=String(data.Stage);
  if(stage!==state.nextStage) throw new Error('This incident is ready for "'+state.nextStage+'". Use Continue from the dashboard to open the correct step.');
  const mapping={
    'Investigation':{sheet:'Investigations',required:['Investigator','Findings','RootCause']},
    'Corrective Action':{sheet:'CorrectiveActions',required:['ActionDescription','ResponsiblePerson','DueDate']},
    'Follow-up':{sheet:'FollowUps',required:['FollowUpBy','Progress']},
    'Verification & Closure':{sheet:'Verifications',required:['VerifiedBy','VerificationDate','Effective','ClosureNotes']}
  };
  const config=mapping[stage]; if(!config) throw new Error('Invalid workflow stage.');
  validateText_(data,config.required);
  if(stage==='Corrective Action'&&!['Pending','In Progress','Completed'].includes(String(data.ActionStatus||'Pending'))) throw new Error('Select a valid corrective action status.');
  if(stage==='Follow-up'&&!['Pending','In Progress','Completed'].includes(String(data.FollowUpStatus||'Pending'))) throw new Error('Select a valid follow-up status.');
  if(stage==='Verification & Closure') {
    if(!['Yes','No'].includes(String(data.Effective))) throw new Error('Select Yes or No for effectiveness.');
    if(String(data.Effective)==='Yes') {
      const ca=latest_(rowsFor_('CorrectiveActions',id)), fu=latest_(rowsFor_('FollowUps',id));
      if(!ca||String(ca.ActionStatus)!=='Completed') throw new Error('Complete the corrective action before closure.');
      if(!fu||String(fu.FollowUpStatus)!=='Completed') throw new Error('Complete follow-up before closure.');
    }
  }
  const record={IncidentID:id,SavedAt:new Date()};
  Object.keys(data).forEach(k=>{if(k!=='Stage'&&k!=='Token'&&k!=='IncidentID')record[k]=cleanText_(data[k]);});
  appendObject_(sheet_(config.sheet),record);
  const updated=workflowState_(id); updateIncident_(id,updated.status,updated.nextStage);
  logAudit_('Management','Workflow saved: '+stage,id,'Saved '+stage+' details. New status: '+updated.status+'. Next: '+updated.nextStage+'.');
  return {success:true,incidentId:id,status:updated.status,nextStage:updated.nextStage};
}
function getOwnerInfo(token) {
  checkManager_(token);
  const base=ScriptApp.getService().getUrl()||'';
  const staffUrl=base ? base+(base.indexOf('?')>=0?'&':'?')+'page=staff' : '';
  const ss=db_();
  return {staffUrl:staffUrl,deploymentUrl:base,demoCount:readObjects_('Incidents').filter(r=>String(r.IsDemo)==='Yes').length,databaseUrl:ss.getUrl(),databaseName:ss.getName()};
}
function testDatabaseConnection(token) { checkManager_(token); const ss=db_(); return {name:ss.getName(),url:ss.getUrl(),sheets:ss.getSheets().map(s=>s.getName())}; }
function getRecentActivity(token) { checkManager_(token); return readObjects_('AuditLog').slice(-100).reverse(); }
function createDemoIncidents(token) {
  checkManager_(token);
  const existing=readObjects_('Incidents').filter(r=>String(r.IsDemo)==='Yes');
  if(existing.length) return {success:true,message:'Demo incidents already exist: '+existing.length+'. Remove them first if you want to recreate the samples.'};
  const types=['Medication','Patient fall','Laboratory','Equipment','Infection control','Documentation','Patient safety','Near miss','Medication','Other'];
  const depts=['Emergency','Ward','Laboratory','Pharmacy'];
  const ids=[];
  for(let i=0;i<10;i++) {
    const id='DEMO-'+Utilities.getUuid().slice(0,8).toUpperCase(); ids.push(id);
    appendObject_(sheet_('Incidents'),{IncidentID:id,CreatedAt:new Date(),ReporterName:'Demo Staff '+(i+1),ReporterRole:'Staff',Department:depts[i%4],IncidentDate:Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyy-MM-dd'),IncidentTime:'10:00',IncidentType:types[i],Location:'Demo Location',Severity:['Low','Moderate','High','Critical'][i%4],InjuryOrHarm:'No',Description:'DEMO ONLY - Sample incident '+(i+1),ImmediateAction:'Demo action',Status:'Pending',CurrentStage:'Investigation',IsDemo:'Yes'});
  }
  // Provide multiple workflow examples for realistic dashboard testing: 3 Pending, 4 Corrective Action, 2 Follow-up, 1 Closed.
  ids.forEach((id,i)=>{
    if(i>=3) appendObject_(sheet_('Investigations'),{IncidentID:id,SavedAt:new Date(),Investigator:'Demo Investigator',InvestigationDate:Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyy-MM-dd'),Findings:'Demo finding',RootCause:'Demo root cause',ContributingFactors:'Demo contributing factor'});
    if(i>=7) appendObject_(sheet_('CorrectiveActions'),{IncidentID:id,SavedAt:new Date(),ActionDescription:'Demo corrective action',ResponsiblePerson:'Demo Owner',DueDate:Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyy-MM-dd'),ActionStatus:'Completed',CompletionNotes:'Demo completed'});
    else if(i>=3) appendObject_(sheet_('CorrectiveActions'),{IncidentID:id,SavedAt:new Date(),ActionDescription:'Demo corrective action awaiting completion',ResponsiblePerson:'Demo Owner',DueDate:Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyy-MM-dd'),ActionStatus:i%2?'In Progress':'Pending',CompletionNotes:''});
    if(i>=9) appendObject_(sheet_('FollowUps'),{IncidentID:id,SavedAt:new Date(),FollowUpDate:Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyy-MM-dd'),FollowUpBy:'Demo Reviewer',Progress:'Demo follow-up completed',NextReviewDate:Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyy-MM-dd'),FollowUpStatus:'Completed'});
    else if(i>=7) appendObject_(sheet_('FollowUps'),{IncidentID:id,SavedAt:new Date(),FollowUpDate:Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyy-MM-dd'),FollowUpBy:'Demo Reviewer',Progress:'Demo follow-up pending',NextReviewDate:Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyy-MM-dd'),FollowUpStatus:'In Progress'});
    if(i===9) appendObject_(sheet_('Verifications'),{IncidentID:id,SavedAt:new Date(),VerifiedBy:'Demo Verifier',VerificationDate:Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyy-MM-dd'),Effective:'Yes',ClosureNotes:'Demo incident closed'});
  });
  logAudit_('Management','Demo data created','', 'Created 10 demo incidents for testing.');
  return {success:true,message:'Created 10 demo incidents with sample workflow statuses. Demo records are labelled DEMO.'};
}
function deleteDemoIncidents(token) {
  checkManager_(token);
  const ids=readObjects_('Incidents').filter(r=>String(r.IsDemo)==='Yes').map(r=>String(r.IncidentID));
  ['Investigations','CorrectiveActions','FollowUps','Verifications'].forEach(name=>{
    const sh=sheet_(name),values=sh.getDataRange().getValues(); if(values.length<2)return;
    const idCol=values[0].indexOf('IncidentID');
    for(let i=values.length-1;i>=1;i--) if(idCol>=0&&ids.includes(String(values[i][idCol]))) sh.deleteRow(i+1);
  });
  const sh=sheet_('Incidents'),values=sh.getDataRange().getValues(),idCol=values[0].indexOf('IncidentID'),demoCol=values[0].indexOf('IsDemo');
  for(let i=values.length-1;i>=1;i--) if(demoCol>=0&&idCol>=0&&String(values[i][demoCol])==='Yes') sh.deleteRow(i+1);
  logAudit_('Management','Demo data removed','', 'Removed '+ids.length+' demo incidents and their workflow records.');
  return {success:true,message:'Removed '+ids.length+' demo incidents and their workflow records.'};
}
