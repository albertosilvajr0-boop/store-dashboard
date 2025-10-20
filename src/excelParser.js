import * as XLSX from 'xlsx';

export function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });

        const sheets = {};
        workbook.SheetNames.forEach(sheetName => {
          sheets[sheetName] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
            raw: false,
            defval: ''
          });
        });

        resolve({ sheets, workbook });
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

export function getPeriodFromDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}
