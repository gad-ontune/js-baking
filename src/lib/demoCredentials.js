/**
 * Public credentials for the LOCAL demo backend only.
 *
 * These are deliberately long, non-production passwords that the matching
 * `backend/scripts/seed_demo.py` script creates. They are not secrets and must
 * never be used for a real deployment. Run the seed script before using the
 * one-click buttons, or the API will reject the sign-in.
 */
export const DEMO_ACCOUNTS = [
  {
    username: 'amina',
    password: 'JSBH-Owner-2026',
    role: 'Owner',
    access: 'Full access',
    primary: true,
  },
  {
    username: 'brian',
    password: 'JSBH-Staff-2026',
    role: 'Staff',
    access: 'Limited access',
  },
  {
    username: 'wanjiku',
    password: 'JSBH-Manager-2026',
    role: 'Manager',
    access: 'Operations & reports',
  },
]
