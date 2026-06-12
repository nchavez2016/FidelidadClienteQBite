## Goal
Add two new fields to the customer registration form (`/cliente/registro`):
- **Correo electrónico** (email)
- **Fecha de nacimiento** (birthdate)

Both must be persisted in the database alongside the existing profile data.

## Database changes (migration)
Extend `public.profiles`:
- `email text` (nullable, unique when not null via partial index — to allow recovery later).
- `birthdate date` (nullable).
- Update `profiles_guard_privileged_fields` trigger? Not needed — these are user-editable fields, no guard required.
- Update `handle_new_user()` trigger to read `email` and `birthdate` from `raw_user_meta_data` and insert them into the new columns.

## Form changes (`src/pages/CustomerRegister.tsx`)
- Add `email` input (type=email, required, validated).
- Add `birthdate` input (type=date, required, must be a past date, age ≥ 13).
- Pass both in the `signUp` metadata payload: `{ display_name, gender, email, birthdate, consent_accepted: true }`.
- Validation via existing zod approach (extend `customerRegistrationSchema` in `src/services/validation/schemas.ts`).

## Auth layer (`src/contexts/AuthContext.tsx` / `signUp`)
- Forward new metadata keys (`email`, `birthdate`) when calling `supabase.auth.signUp`. The handle_new_user trigger picks them up from `raw_user_meta_data`.
- No change to the auth identity itself — login still uses phone+password (email is profile data, not the auth handle), to avoid breaking existing customer login.

## Type updates
- Extend `Customer` interface (`src/lib/types.ts`) with optional `email?: string` and `birthdate?: string`.
- Update `customers.service.ts` mapper to read these from the `profiles` row.

## Out of scope
- No change to staff registration.
- No change to login (phone remains the auth handle).
- No backfill of existing rows — new columns are nullable.

## Technical summary
1. Migration: `ALTER TABLE profiles ADD COLUMN email text, ADD COLUMN birthdate date;` + update `handle_new_user()`.
2. Update zod schema with email + birthdate validation.
3. Update `CustomerRegister.tsx` with two new fields and validation.
4. Update `signUp` metadata pass-through.
5. Update `Customer` type + customers mapper.
