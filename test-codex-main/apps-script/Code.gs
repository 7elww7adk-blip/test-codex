/**
 * Google Apps Script Web App
 * يقرأ البيانات من Google Sheets ويرجع JSON للواجهة.
 */
function doGet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet();

  const payload = {
    categories: readCategories(sheet.getSheetByName('categories')),
    heroBanners: readHeroBanners(sheet.getSheetByName('heroBanners')),
    products: readProducts(sheet.getSheetByName('products')),
    brands: readBrands(sheet.getSheetByName('brands')),
  };

  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function readRows(sheet) {
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];

  const headers = values[0].map(String);
  return values.slice(1)
    .filter(row => row.some(cell => String(cell).trim() !== ''))
    .map(row => headers.reduce((acc, key, i) => {
      acc[key] = row[i];
      return acc;
    }, {}));
}

function readCategories(sheet) {
  return readRows(sheet).map(r => [String(r.name || ''), String(r.image || '')]);
}

function readHeroBanners(sheet) {
  return readRows(sheet).map(r => String(r.image || '')).filter(Boolean);
}

function readProducts(sheet) {
  return readRows(sheet).map(r => ({
    name: String(r.name || ''),
    price: Number(r.price || 0),
    old: Number(r.old || 0),
    brand: String(r.brand || ''),
    code: String(r.code || ''),
    image: String(r.image || ''),
  }));
}

function readBrands(sheet) {
  return readRows(sheet).map(r => [String(r.name || ''), String(r.logo || '')]);
}
