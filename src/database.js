import { supabase } from './supabase.js';
import { getPeriodFromDate } from './excelParser.js';

export async function saveUploadedFile(filename, uploadedBy, fileSize) {
  console.log('saveUploadedFile called with:', { filename, uploadedBy, fileSize });
  const { data, error } = await supabase
    .from('uploaded_files')
    .insert({
      filename,
      uploaded_by: uploadedBy,
      file_size: fileSize,
      processing_status: 'processing'
    })
    .select()
    .maybeSingle();

  if (error) {
    console.error('Error saving uploaded file:', error);
    throw error;
  }
  console.log('saveUploadedFile result:', data);
  return data;
}

export async function updateFileStatus(fileId, status) {
  const { error } = await supabase
    .from('uploaded_files')
    .update({ processing_status: status })
    .eq('id', fileId);

  if (error) throw error;
}

export async function saveSalesData(fileId, salesData, period = getPeriodFromDate()) {
  const records = salesData.map(item => ({
    file_id: fileId,
    name: item.name,
    sales_count: item.sales || 0,
    calls: item.calls || 0,
    texts: item.texts || 0,
    created: item.created || 0,
    shown: item.shown || 0,
    period
  }));

  console.log('Inserting', records.length, 'sales records');
  const { error } = await supabase
    .from('sales_data')
    .insert(records);

  if (error) {
    console.error('Error saving sales data:', error);
    throw error;
  }
  console.log('Sales data inserted successfully');
}

export async function saveBDCData(fileId, bdcData, period = getPeriodFromDate()) {
  const records = bdcData.map(item => ({
    file_id: fileId,
    name: item.name,
    shows: item.shows || 0,
    created: item.created || 0,
    shown: item.shown || 0,
    calls: item.calls || 0,
    period
  }));

  console.log('Inserting', records.length, 'BDC records');
  const { error } = await supabase
    .from('bdc_data')
    .insert(records);

  if (error) {
    console.error('Error saving BDC data:', error);
    throw error;
  }
  console.log('BDC data inserted successfully');
}

export async function savePersonDetails(fileId, details, period = getPeriodFromDate()) {
  const { error } = await supabase
    .from('person_details')
    .insert({
      file_id: fileId,
      name: details.name,
      type: details.type,
      working_days: details.workingDays || 0,
      calls_mtd: details.callsMTD || 0,
      sales_mtd: details.salesMTD || 0,
      texts_mtd: details.textsMTD || 0,
      shown_mtd: details.shownMTD || 0,
      created_mtd: details.createdMTD || 0,
      leads_in_name_mtd: details.leadsInNameMTD || 0,
      avg_talk: details.avgTalk || '0:00',
      last_work_day: details.lastWorkDay || null,
      last_day_calls: details.lastDayCalls || 0,
      last_day_sales: details.lastDaySales || 0,
      last_day_avg_talk: details.lastDayAvgTalk || '0:00',
      pr_notes_wins: details.prNotesWins || null,
      pr_notes_opportunities: details.prNotesOpportunities || null,
      period
    });

  if (error) throw error;
}

export async function saveCallSheets(fileId, callsData, assignedTo, period = getPeriodFromDate()) {
  const records = callsData.map(call => ({
    file_id: fileId,
    assigned_to: assignedTo,
    customer_name: call.name || '',
    phone: call.phone || '',
    email: call.email || '',
    sales_person: call.salesPerson || '',
    bdc_agent: call.bdcAgent || '',
    source: call.source || '',
    date_in: call.dateIn || null,
    lead_age: call.leadAge || 0,
    days_since: call.daysSince || 0,
    bucket: call.bucket || '',
    status: call.status || '',
    reason: call.reason || '',
    link: call.link || '',
    rep_called_last_work_day: call.repCalledLastWorkDay || false,
    last_work_day: call.lastWorkDay || '',
    period
  }));

  const { error } = await supabase
    .from('call_sheets')
    .insert(records);

  if (error) throw error;
}

export async function getLatestLeaderboards(period = getPeriodFromDate()) {
  const [salesResult, bdcResult] = await Promise.all([
    supabase
      .from('sales_data')
      .select('*')
      .eq('period', period)
      .order('sales_count', { ascending: false }),
    supabase
      .from('bdc_data')
      .select('*')
      .eq('period', period)
      .order('shows', { ascending: false })
  ]);

  if (salesResult.error) throw salesResult.error;
  if (bdcResult.error) throw bdcResult.error;

  return {
    sales: salesResult.data.map(row => ({
      name: row.name,
      sales: row.sales_count,
      calls: row.calls,
      texts: row.texts,
      created: row.created,
      shown: row.shown
    })),
    bdc: bdcResult.data.map(row => ({
      name: row.name,
      shows: row.shows,
      created: row.created,
      shown: row.shown,
      calls: row.calls
    }))
  };
}

export async function getPersonDetails(personName, period = getPeriodFromDate()) {
  const { data, error } = await supabase
    .from('person_details')
    .select('*')
    .eq('name', personName)
    .eq('period', period)
    .maybeSingle();

  if (error) throw error;

  if (!data) return null;

  return {
    block: {
      name: data.name,
      type: data.type,
      workingDays: data.working_days,
      callsMTD: data.calls_mtd,
      salesMTD: data.sales_mtd,
      textsMTD: data.texts_mtd,
      shownMTD: data.shown_mtd,
      createdMTD: data.created_mtd,
      leadsInNameMTD: data.leads_in_name_mtd,
      avgTalk: data.avg_talk
    },
    lastDay: {
      dateKey: data.last_work_day,
      calls: data.last_day_calls,
      avgTalkMSS: data.last_day_avg_talk,
      sales: data.last_day_sales
    },
    prNotes: {
      wins: data.pr_notes_wins,
      opportunities: data.pr_notes_opportunities
    }
  };
}

export async function getCallSheetsForPerson(personName, period = getPeriodFromDate()) {
  const { data, error } = await supabase
    .from('call_sheets')
    .select('*')
    .eq('assigned_to', personName)
    .eq('period', period);

  if (error) throw error;

  return data.map(row => ({
    name: row.customer_name,
    phone: row.phone,
    email: row.email,
    salesPerson: row.sales_person,
    bdcAgent: row.bdc_agent,
    source: row.source,
    dateIn: row.date_in,
    date: row.date_in,
    leadAge: row.lead_age,
    daysSince: row.days_since,
    bucket: row.bucket,
    status: row.status,
    reason: row.reason,
    link: row.link,
    repCalledLastWorkDay: row.rep_called_last_work_day,
    lastWorkDay: row.last_work_day
  }));
}
