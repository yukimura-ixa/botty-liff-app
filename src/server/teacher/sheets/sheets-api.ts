import { google, sheets_v4 } from "googleapis";
import { GoogleAuth } from "google-auth-library";

let client: sheets_v4.Sheets | null = null;

function sheets(): sheets_v4.Sheets {
  if (client) return client;
  const raw = process.env.GCP_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GCP_SERVICE_ACCOUNT_JSON missing");
  const credentials = JSON.parse(raw);
  const auth = new GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive.file"],
  });
  client = google.sheets({ version: "v4", auth });
  return client;
}

export async function createSpreadsheet(title: string): Promise<{ id: string; url: string }> {
  const res = await sheets().spreadsheets.create({ requestBody: { properties: { title } } });
  const id = res.data.spreadsheetId!;
  const url = res.data.spreadsheetUrl ?? `https://docs.google.com/spreadsheets/d/${id}`;
  return { id, url };
}

export async function clearSheet(id: string, tab: string): Promise<void> {
  await sheets().spreadsheets.values.clear({ spreadsheetId: id, range: tab });
}

export async function writeValues(id: string, range: string, values: (string | number)[][]): Promise<void> {
  await sheets().spreadsheets.values.update({
    spreadsheetId: id,
    range,
    valueInputOption: "RAW",
    requestBody: { values },
  });
}

export async function ensureTab(id: string, title: string): Promise<void> {
  try {
    await sheets().spreadsheets.batchUpdate({
      spreadsheetId: id,
      requestBody: { requests: [{ addSheet: { properties: { title } } }] },
    });
  } catch { /* tab may already exist — ignored */ }
}

export async function spreadsheetUrl(id: string): Promise<string> {
  return `https://docs.google.com/spreadsheets/d/${id}`;
}
