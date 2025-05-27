const Excel = require('exceljs');

/**
 * Normalize a cell value into a primitive string/number.
 */
function normalizeCellValue(cell) {
  const v = cell.value;
  if (v == null) return '';
  if (typeof v === 'object' && v.text) return v.text;  // hyperlink, rich text, etc.
  return v;
}

/**
 * Parse an Excel buffer into an array of objects whose keys
 * are derived from the header row (lowercased, underscored).
 */
async function parseExcelBuffer(buffer) {
  const workbook = new Excel.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];

  // Build normalized keys from the header row
  const headerRow = sheet.getRow(1);
  const headers = headerRow.values
    .slice(1) // skip index 0
    .map(h => String(h).trim().toLowerCase().replace(/\s+/g, '_'));

  const data = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // skip header
    const obj = {};
    headers.forEach((key, idx) => {
      obj[key] = normalizeCellValue(row.getCell(idx + 1));
    });
    data.push(obj);
  });

  return data;
}

module.exports = {
  parseExcelBuffer,
};
