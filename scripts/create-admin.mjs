// Creates the first admin account. Usage:
//   node --env-file=.env.local scripts/create-admin.mjs <email> "<full name>" <employee code>
// Prints nothing secret; writes the temporary password to admin-login.txt (git-ignored).
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";

const [email, fullName, code] = process.argv.slice(2);
if (!email || !fullName || !code) throw new Error("usage: create-admin.mjs <email> <full name> <code>");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const password = randomBytes(9).toString("base64url");
const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (error) throw error;
const { error: pe } = await admin.from("profiles").insert({ auth_user_id: data.user.id, full_name: fullName, employee_code: code, role: "admin" });
if (pe) { await admin.auth.admin.deleteUser(data.user.id); throw pe; }
writeFileSync("admin-login.txt", `Log masuk admin Hadir\nEmel: ${email}\nKata laluan sementara: ${password}\n\nTukar kata laluan di halaman Akaun selepas log masuk, kemudian padam fail ini.\n`);
console.log(`admin created for ${email}; password saved to admin-login.txt`);
