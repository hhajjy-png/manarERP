import ExcelJS from 'exceljs';

async function main() {
  const filePath = 'C:\\Users\\hhajj\\Claude\\Projects\\manarERP\\frontend\\src\\assets\\كشف صرف الشيكات .xlsx';
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  console.log('Sheet names:', wb.worksheets.map((ws) => `${ws.name} (rows=${ws.rowCount}, cols=${ws.columnCount})`));

  const sheet = wb.getWorksheet('Sheet1') ?? wb.worksheets[0];
  console.log('Using sheet:', sheet.name);

  for (let r = 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const values = row.values as unknown[];
    console.log(`Row ${r}:`, JSON.stringify(values));
  }

  console.log('Total rows:', sheet.rowCount);
  console.log('Last row values:', JSON.stringify((sheet.getRow(sheet.rowCount).values as unknown[])));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
