export function processLeaderboardData(sheets) {
  const salesLeaderboard = [];
  const bdcLeaderboard = [];

  const mapping = window.sheetMapping || {};
  const salesSheet = sheets[mapping.sales] || sheets['BDC Sales'] || sheets['Sales'] || sheets['sales'] || [];
  const bdcSheet = sheets[mapping.bdc] || sheets['BDC_Agent_Tracking'] || sheets['BDC'] || sheets['bdc'] || [];
  const apptSheet = sheets[mapping.appt] || sheets['Appt Act'] || sheets['appt act'] || [];

  const apptMap = new Map();
  apptSheet.forEach(row => {
    const name = (row['Name'] || row['name'] || '').trim().toUpperCase();
    if (name) {
      apptMap.set(name, {
        created: parseInt(row['Created'] || row['created'] || 0),
        shown: parseInt(row['Shown'] || row['shown'] || 0)
      });
    }
  });

  salesSheet.forEach(row => {
    const name = (row['Name'] || row['name'] || row['Sales Person'] || '').trim();
    if (!name) return;

    const nameUpper = name.toUpperCase();
    const apptData = apptMap.get(nameUpper) || { created: 0, shown: 0 };

    salesLeaderboard.push({
      name,
      sales: parseInt(row['Sales'] || row['sales'] || row['Sales Count'] || 0),
      calls: parseInt(row['Calls'] || row['calls'] || 0),
      texts: parseInt(row['Texts'] || row['texts'] || 0),
      created: apptData.created,
      shown: apptData.shown
    });
  });

  bdcSheet.forEach(row => {
    const name = (row['Name'] || row['name'] || row['BDC Agent'] || '').trim();
    if (!name) return;

    const nameUpper = name.toUpperCase();
    const apptData = apptMap.get(nameUpper) || { created: 0, shown: 0 };

    bdcLeaderboard.push({
      name,
      shows: parseInt(row['Shows'] || row['shows'] || row['Appointments Shown'] || 0),
      created: apptData.created,
      shown: apptData.shown,
      calls: parseInt(row['Calls'] || row['calls'] || 0)
    });
  });

  salesLeaderboard.sort((a, b) => (b.sales || 0) - (a.sales || 0));
  bdcLeaderboard.sort((a, b) => (b.shows || 0) - (a.shows || 0));

  return { sales: salesLeaderboard, bdc: bdcLeaderboard };
}

export function processPersonDetails(sheets, personName) {
  const upperName = personName.toUpperCase();
  const details = {
    name: personName,
    type: 'Sales',
    workingDays: 0,
    callsMTD: 0,
    salesMTD: 0,
    textsMTD: 0,
    shownMTD: 0,
    createdMTD: 0,
    leadsInNameMTD: 0,
    avgTalk: '0:00',
    lastWorkDay: null,
    lastDayCalls: 0,
    lastDaySales: 0,
    lastDayAvgTalk: '0:00'
  };

  const mapping = window.sheetMapping || {};
  const detailsSheet = sheets[mapping.details] || sheets['User Act'] || sheets['Details'] || sheets['details'] || sheets['Person Details'] || [];
  const personRow = detailsSheet.find(row =>
    (row['Name'] || row['name'] || '').trim().toUpperCase() === upperName
  );

  if (personRow) {
    details.type = personRow['Type'] || personRow['type'] || 'Sales';
    details.workingDays = parseInt(personRow['Working Days'] || personRow['working_days'] || 0);
    details.callsMTD = parseInt(personRow['Calls MTD'] || personRow['calls_mtd'] || 0);
    details.salesMTD = parseInt(personRow['Sales MTD'] || personRow['sales_mtd'] || 0);
    details.textsMTD = parseInt(personRow['Texts MTD'] || personRow['texts_mtd'] || 0);
    details.shownMTD = parseInt(personRow['Shown MTD'] || personRow['shown_mtd'] || 0);
    details.createdMTD = parseInt(personRow['Created MTD'] || personRow['created_mtd'] || 0);
    details.leadsInNameMTD = parseInt(personRow['Leads In Name MTD'] || personRow['leads_in_name_mtd'] || 0);
    details.avgTalk = personRow['Avg Talk'] || personRow['avg_talk'] || '0:00';
    details.lastWorkDay = personRow['Last Work Day'] || personRow['last_work_day'] || null;
    details.lastDayCalls = parseInt(personRow['Last Day Calls'] || personRow['last_day_calls'] || 0);
    details.lastDaySales = parseInt(personRow['Last Day Sales'] || personRow['last_day_sales'] || 0);
    details.lastDayAvgTalk = personRow['Last Day Avg Talk'] || personRow['last_day_avg_talk'] || '0:00';
  }

  return details;
}

export function processCallSheets(sheets, personName) {
  const upperName = personName.toUpperCase();
  const mapping = window.sheetMapping || {};
  const callSheetsData = sheets[mapping.calls] || sheets['Call Sheets'] || sheets['call sheets'] || sheets['Calls'] || [];

  const personCalls = callSheetsData.filter(row => {
    const assignedTo = (row['Assigned To'] || row['assigned_to'] || row['Sales Person'] || '').trim().toUpperCase();
    return assignedTo === upperName;
  });

  return personCalls.map(row => ({
    name: row['Customer'] || row['customer'] || row['Customer Name'] || '',
    phone: row['Phone'] || row['phone'] || '',
    email: row['Email'] || row['email'] || '',
    salesPerson: row['Sales Person'] || row['sales_person'] || '',
    bdcAgent: row['BDC Agent'] || row['bdc_agent'] || '',
    source: row['Source'] || row['source'] || '',
    dateIn: row['Date In'] || row['date_in'] || row['Date'] || '',
    leadAge: parseInt(row['Lead Age'] || row['lead_age'] || 0),
    daysSince: parseInt(row['Days Since'] || row['days_since'] || row['Days Since Contact'] || 0),
    bucket: row['Bucket'] || row['bucket'] || row['Priority Bucket'] || '',
    status: row['Status'] || row['status'] || '',
    reason: row['Reason'] || row['reason'] || row['Priority Reason'] || '',
    link: row['Link'] || row['link'] || row['URL'] || '',
    repCalledLastWorkDay: row['Called Last Work Day'] === 'Yes' || row['called_last_work_day'] === true,
    lastWorkDay: row['Last Work Day'] || row['last_work_day'] || ''
  }));
}
