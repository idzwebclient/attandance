# Sistem Kehadiran (Attendance System)

PWA kehadiran pekerja: imbas QR cawangan + semakan GPS di server.
Spesifikasi penuh: `ATTENDANCE_APP_SPEC.md` (dengan keputusan tambahan di bawah).

Stack: Next.js + TypeScript, Supabase (Auth, Postgres, RLS), Vercel.

## Keputusan tambahan kepada spec

1. Staf boleh tamat kerja tanpa rehat. Ketika status `WORKING`, app tanya "Mula rehat" atau "Tamat kerja";
   server hanya terima pilihan yang sah (`break_status = NO_BREAK`).
2. Hari yang tidak lengkap dipaparkan sebagai `INCOMPLETE` selepas tengah malam. Admin boleh betulkan
   rekod melalui `admin_correct_attendance`; setiap pembetulan disimpan dalam `attendance_corrections`.
3. Hari bekerja Isnin–Jumaat (`system_settings.work_days`) dan cuti umum (`public_holidays`) untuk laporan.
4. Seorang manager = satu cawangan. Staf dan manager boleh punch; admin tidak.
5. Radius lalai 100 m, had ketepatan GPS 100 m, masa dikira ikut minit (09:00:59 = ON_TIME).
6. Admin cipta akaun (emel + kata laluan sementara). Pendaftaran awam ditutup.

## Struktur

- `supabase/migrations/` — skema, RLS dan semua logik kehadiran (fungsi Postgres, satu transaksi).
- `tests/db/` — ujian logik pangkalan data menggunakan PGlite (Postgres dalam Node).
- `src/` — aplikasi Next.js.

Semua penulisan kehadiran melalui RPC `submit_attendance`; jenis event, masa dan mod rehat (biasa/remote)
ditentukan oleh server.

## Arahan

```bash
npm install
npm test        # ujian logik kehadiran
npm run dev     # app di http://localhost:3000
```

### Setup Supabase

1. Cipta projek Supabase (region Singapore).
2. Jalankan fail dalam `supabase/migrations/` (SQL Editor, atau `supabase db push`).
3. Authentication > Sign In / Providers: matikan "Allow new users to sign up".
4. Salin `.env.example` ke `.env.local` dan isi kunci projek.
5. Admin pertama: cipta pengguna di Authentication > Users, kemudian di SQL Editor:

```sql
insert into public.profiles (auth_user_id, full_name, employee_code, role)
select id, 'Nama Admin', 'A001', 'admin' from auth.users where email = 'admin@contoh.com';
```

### Skrip

- `node --env-file=.env.local scripts/create-admin.mjs <emel> "<nama>" <kod>`: cipta akaun admin (kata laluan sementara disimpan dalam `admin-login.txt`).
- `SUPABASE_ACCESS_TOKEN=... node --env-file=.env.local scripts/smoke-test.mjs`: semakan hujung ke hujung pada projek Supabase sebenar; data ujian dipadam selepas itu.
