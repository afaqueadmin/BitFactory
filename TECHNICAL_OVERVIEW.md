# BitFactory: Comprehensive Technical Overview

**Project**: BitFactory Mining Dashboard  
**Tech Stack**: Next.js 15 (App Router), PostgreSQL (Neon Cloud), Prisma ORM, Material-UI  
**Authentication**: JWT (Access + Refresh Tokens)  
**Deployment**: Server-side API integration with Luxor Mining Pool  
**Last Updated**: December 2025

---

## 1. Overall Architecture

### Technology Stack
- **Frontend Framework**: Next.js 15 with App Router (React 19)
- **UI Library**: Material-UI (MUI v7) with custom theming
- **Backend**: Node.js server-side functions via Next.js API routes
- **Database**: PostgreSQL (Neon Cloud) with Prisma ORM
- **Authentication**: JWT tokens (access + refresh) with bcryptjs hashing
- **External API**: Luxor Mining Pool API (https://app.luxor.tech/api/v1)
- **Cloud Storage**: Cloudinary (image uploads)
- **Email Service**: SMTP (Gmail)
- **Two-Factor Authentication**: TOTP-based (speakeasy library)
- **Styling**: Tailwind CSS + Material-UI theming

### Hybrid Model: Local Database + Luxor API

BitFactory operates as a **hybrid platform** combining local database operations with real-time mining pool data:

**Local Database (PostgreSQL via Prisma)**:
- User accounts and authentication
- Role management (ADMIN vs CLIENT)
- User profile data (email, name, wallet address, company info, etc.)
- Cost payments and balance tracking
- Miners and mining spaces (local inventory)
- User activity logs
- Electricity rates and calculations
- Two-factor authentication secrets

**Luxor API (Remote Integration)**:
- Workspace groups management (organization structure)
- Subaccount creation and management (mining pool accounts)
- Worker status and performance metrics (active/inactive counts)
- Hashrate and efficiency data
- Pool worker details and statistics
- Real-time mining metrics

The separation exists because:
1. User management and permissions are business logic handled locally
2. Mining pool operations require real-time data from Luxor's infrastructure
3. Balance tracking for internal billing happens locally, while worker status is fetched live
4. Groups and subaccounts are organizational constructs partially stored locally and referenced in Luxor

### Request Flow: Authentication, Middleware, and API Routes

```
User Request
    ↓
[Next.js Middleware] - Authenticates via JWT, enforces role-based routing
    ↓
Route Group Enforcement:
  - (auth) → CLIENT routes
  - (manage) → ADMIN routes
  - (public) → unauthenticated routes
    ↓
Server-Side Component / Client Component
    ↓
API Route Handler (if needed)
    ↓
[Luxor Proxy] OR [Prisma Database] OR [Both]
    ↓
Response to Client
```

#### Middleware (`src/middleware.ts`)
The middleware runs on every non-API request and:
- Verifies JWT tokens from cookies
- Enforces role-based access control (ADMIN sees `/manage/*`, CLIENT sees `/auth/*`)
- Redirects unauthenticated users to login
- Redirects logged-in users away from login page
- Allows public paths (/, /login, static assets) without authentication
- Handles token expiration with graceful redirect

#### Routing Structure
- **Root Layout** (`src/app/layout.tsx`): Wraps entire app with AuthProvider and ThemeProvider
- **Public Layout** (`src/app/(public)/layout.tsx`): Login and landing page
- **Auth Layout** (`src/app/(auth)/layout.tsx`): Client dashboard, wallet, account settings (AppBar + Footer)
- **Manage Layout** (`src/app/(manage)/layout.tsx`): Admin panel, customer management (AppBar + Footer)

#### Client-Side Authentication Flow
- AuthProvider (via React Context) maintains user state globally
- On app load, `checkAuth()` verifies token validity
- Every 5 minutes, background check ensures token hasn't expired
- Failed auth triggers redirect to login
- JWT contains userId and role for authorization decisions

---

## 2. Admin-Side Pages (`/src/app/(manage)/*`)

### Admin Panel Overview (`/manage/adminpanel`)
**Purpose**: Central admin dashboard with high-level statistics and navigation.

**What it displays**:
- Total customers count
- Active customers count
- Total revenue across all clients
- Total miners deployed
- Recent customer activity table

**APIs called**:
- `/api/user/all` - Fetches all users with miner counts and status
- `/api/admin/dashboard` - Fetches admin-level statistics from Luxor

**Database tables accessed**:
- User (read)
- Miner (read, count)

**Key workflow**:
- Admin logs in and lands here
- Sees aggregated statistics
- Can navigate to manage customers, groups, workers, spaces, machines

### Customer Management (`/manage/customers/overview`)
**Purpose**: Full CRUD operations for user accounts with group assignment.

**What it displays**:
- List of all CLIENT users in a data table
- Per-customer: name, email, wallet address, miner count, status, join date
- Stats cards showing total/active customers and total revenue
- Action menu (Edit, Change Password, Add Payment, Delete)

**APIs called**:
- `GET /api/user/all` - Fetch all users
- `POST /api/user/create` - Create new user with Luxor subaccount
- `PUT /api/user/[id]` - Update user profile
- `POST /api/user/[id]/change-password` - Change user password
- `DELETE /api/user/[id]` - Delete user
- `POST /api/cost-payments` - Add payment/charge to user

**Database operations**:
- User (read, create, update, delete)
- CostPayment (create) - when adding payments
- Miner (read, count by user)

**Modals**:
1. **CreateUserModal**: Collects user details (name, email, role) and Luxor group selection
   - Calls user creation API
   - Luxor subaccount is created automatically
   - Initial deposit can be added

2. **EditCustomerModal**: Updates user profile (name, email, contact info, etc.)

3. **ChangePasswordModal**: Generates new temporary password and sends email

4. **AddPaymentModal**: Adds PAYMENT or ELECTRICITY_CHARGES entry
   - Calculates balance automatically based on previous balance
   - PAYMENT adds to balance, ELECTRICITY_CHARGES subtracts

**Critical workflow**:
1. Admin clicks "Create User"
2. Fills name, email, selects one or more Luxor groups
3. API creates local user in DB
4. API calls Luxor to create subaccount under selected group(s)
5. Luxor-returned subaccount name is stored in `User.luxorSubaccountName`
6. User receives welcome email with credentials

### Groups Management (`/manage/groups`)
**Purpose**: Manage Luxor workspace groups (organizational structure for miners).

**What it displays**:
- Table of all groups from Luxor workspace
- Group name, member count, subaccount count
- Actions: Edit name, View details, Delete
- Stats on total groups and members

**APIs called**:
- `GET /api/luxor?endpoint=workspace` - Fetch all workspace groups
- `POST /api/luxor?endpoint=group&operation=create` - Create new group
- `PATCH /api/luxor?endpoint=group&operation=update&groupId=...` - Rename group
- `DELETE /api/luxor?endpoint=group&operation=delete&groupId=...` - Delete group
- `GET /api/luxor?endpoint=group&operation=get&groupId=...` - Get group details

**Luxor endpoints used**:
- `GET /workspace` - Fetch workspace with all groups
- `POST /workspace/groups` - Create group
- `PATCH /workspace/groups/{groupId}` - Update group
- `DELETE /workspace/groups/{groupId}` - Delete group
- `GET /workspace/groups/{groupId}` - Get group details

**Database operations**:
- None (purely Luxor management)

**Workflow**:
1. Admin creates group in Luxor
2. Subaccounts are assigned to groups
3. Users are linked to subaccounts (via user creation)
4. Groups organize miners by division/project/customer

### Subaccounts Management (`/manage/subaccounts`)
**Purpose**: Manage Luxor subaccounts within groups (mining pool accounts).

**What it displays**:
- Dropdown to select group
- Table of subaccounts within selected group
- Subaccount name, creation date, URL
- Actions: View details, Remove from group

**APIs called**:
- `GET /api/luxor?endpoint=workspace` - Fetch all groups
- `GET /api/luxor?endpoint=subaccount&operation=list&groupId=...` - List subaccounts in group
- `POST /api/luxor?endpoint=subaccount&operation=add&groupId=...&name=...` - Add subaccount to group
- `DELETE /api/luxor?endpoint=subaccount&operation=remove&groupId=...&name=...` - Remove subaccount

**Luxor endpoints used**:
- `GET /workspace/groups/{groupId}` - Get group with subaccounts
- `POST /pool/groups/{groupId}/subaccounts` - Add subaccount
- `DELETE /pool/groups/{groupId}/subaccounts/{subaccountName}` - Remove subaccount

**Database operations**:
- None (purely Luxor management)
- Local User model stores `luxorSubaccountName` for reference

**Key validation**:
- Subaccount names must be lowercase, numbers, underscores, hyphens only
- Names must be unique within workspace
- Cannot delete subaccount if it's linked to active user

### Workers Management (`/manage/workers`)
**Purpose**: View all workers across all subaccounts in real-time from Luxor.

**What it displays**:
- Table of all workers with filters by subaccount
- Worker name, status (ACTIVE/INACTIVE), hashrate, efficiency, firmware
- Stale shares and rejected shares counts
- Last share time

**APIs called**:
- `GET /api/luxor?endpoint=workers&currency=BTC` - Fetch all workers

**Luxor endpoints used**:
- `GET /pool/workers/BTC?subaccount_names=...` - Fetch workers for subaccounts

**Database operations**:
- None (read-only from Luxor)

**Filters**:
- By subaccount name
- By status (active/inactive)
- By date range
- Search by worker name or ID

### Space Management (`/manage/space`)
**Purpose**: Manage local mining spaces (physical locations/infrastructure).

**What it displays**:
- Table of spaces with name, location, capacity, power capacity
- Miners assigned to each space
- Status (AVAILABLE/OCCUPIED)

**APIs called**:
- `GET /api/spaces` - Fetch all spaces
- `POST /api/spaces` - Create new space
- `PUT /api/spaces/[id]` - Update space details
- `DELETE /api/spaces/[id]` - Delete space

**Database tables accessed**:
- Space (read, create, update, delete)
- Miner (read, to show assigned miners)

### Machine Management (`/manage/machine`)
**Purpose**: Manage mining machines/hardware inventory.

**What it displays**:
- Table of machines with model, status, power usage, hash rate
- Assigned space and owner
- Actions to edit or delete

**APIs called**:
- `GET /api/machine` - Fetch all machines
- `POST /api/machine` - Create machine
- `PUT /api/machine/[id]` - Update machine
- `DELETE /api/machine/[id]` - Delete machine

**Database tables accessed**:
- Miner (read, create, update, delete)
- User (read, to show owner)
- Space (read, to show location)

---

## 3. Client-Side Pages (`/src/app/(auth)/*`)

### Dashboard (`/auth/dashboard`)
**Purpose**: Main landing page for authenticated clients showing their mining operations overview.

**What it displays**:
- Greeting with user name
- HostedMinersCard: Active and inactive worker counts (factory status)
- MarketplaceCard: Coming soon feature teaser
- Four GradientStatCard instances with metrics (earnings, pool difficulty, today's revenue, total earnings)
- MiningEarningsChart: Historical earnings visualization

**APIs called**:
- `GET /api/workers/stats` - Fetch active/inactive worker counts from Luxor
- `GET /api/user/balance` - Get user's current balance
- `GET /api/miners/daily-costs` - Get daily cost calculations

**Database operations**:
- None (all data fetched via APIs)

**Real-time data**:
- Worker stats refresh on component mount
- User can manually refresh worker stats
- Loading states and error handling for failed API calls

**Key workflow**:
1. User logs in, redirected here
2. Sees dashboard with live worker stats from Luxor
3. Active workers shown in green, inactive in red
4. Stats cards show balance and earning metrics
5. Can click on cards for more details

### My Miners (`/auth/miners`)
**Purpose**: View all miners associated with the current user with local metrics.

**What it displays**:
- Table of miners owned by user
- Model, status, power usage, hash rate
- Assigned space
- Stats cards: total earnings (EUR/USD), cost per kWh, today's earnings

**APIs called**:
- `GET /api/miners/user` - Fetch miners for logged-in user
- `GET /api/miners/daily-costs` - Get daily cost data
- `GET /api/btcprice` - Get current BTC price for USD conversion

**Database operations**:
- Miner (read, filtered by userId)
- Space (read, for miner locations)

**Key features**:
- Can add new miners (opens AddMinerModal)
- Filter by status
- Export miner data
- Visual indicators for performance

### My Wallet (`/auth/wallet`)
**Purpose**: View account balance, transaction history, and electricity costs.

**What it displays**:
- Pending payout and total earnings in USD (converted from BTC)
- ElectricityCostTable: Complete transaction history with:
  - Date, Type (Payment/Electricity Charges)
  - Consumption (kWh), Amount (USD), Balance
  - Searchable, sortable, paginated

**APIs called**:
- `GET /api/btcprice` - Get current BTC price for conversion
- `GET /api/cost-payments` - Fetch user's cost payments with pagination

**Database operations**:
- User (read, to get balance)
- CostPayment (read, with pagination and filtering)
- ElectricityRate (implied, for cost calculations)

**ElectricityCostTable features**:
- Fetches real payment history from database
- Displays balance progression
- Color-coded: amounts in red (debit) or green (credit)
- Sortable by any column
- Search functionality across all fields
- Pagination (5, 10, 25 rows per page)

**Balance calculation**:
- Each payment/charge entry includes running balance
- When new payment added: `newBalance = previousBalance ± amount`
- PAYMENT type: adds to balance
- ELECTRICITY_CHARGES: subtracts from balance

### Account Settings (`/auth/account-settings`)
**Purpose**: Manage user profile, 2FA, and activity logs.

**What it displays**:
- Profile information form (name, email, phone, address, company, wallet, etc.)
- Profile picture upload with preview
- Two-Factor Authentication setup and management
- Recent login activity table
- Change password button

**APIs called**:
- `GET /api/user/profile` - Fetch user profile data
- `PUT /api/user/profile` - Update profile information
- `POST /api/user/upload-image` - Upload profile picture to Cloudinary
- `POST /api/user/change-password` - Change password
- `POST /api/auth/2fa/setup` - Setup 2FA (returns QR code)
- `POST /api/auth/2fa/verify` - Verify 2FA during setup
- `POST /api/auth/2fa/validate` - Validate 2FA code on login
- `POST /api/auth/2fa/disable` - Disable 2FA

**Database operations**:
- User (read, update)
- UserActivity (read, to display login history)

**Two-Factor Authentication**:
- Based on TOTP (Time-based One-Time Password)
- Uses speakeasy library for generation
- 6-digit codes, 30-second window
- Backup codes for recovery
- Optional (admin can enable globally)

### Profile Page (`/auth/profile`)
**Purpose**: Simplified profile view (stub for future expansion).

Currently displays placeholder text. Could be expanded with:
- Public profile information
- Mining statistics
- Performance metrics
- Achievement badges

---

## 4. API Layer Overview (`/src/app/api/*`)

### Authentication APIs

#### `POST /api/login`
- Accepts email and password
- Validates credentials against bcrypt hash in database
- Returns JWT access token and refresh token as HTTP-only cookies
- Logs login activity to UserActivity table
- Handles 2FA check if enabled
- Returns redirect URL based on user role

#### `POST /api/auth/check`
- Verifies current session validity
- Returns authenticated user data (id, email, name, role)
- Used by AuthProvider for periodic checks
- Attempts token refresh if expired

#### `POST /api/auth/signout`
- Blacklists current token
- Clears cookies on client
- Logs out user from all sessions

#### `POST /api/auth/2fa/setup`
- Generates TOTP secret for user
- Returns QR code as data URL
- User must verify before activation

#### `POST /api/auth/2fa/verify`
- Validates TOTP code during setup
- Generates backup codes
- Activates 2FA for user account

#### `POST /api/auth/2fa/validate`
- Validates TOTP code on login
- Public endpoint (no auth required)
- Used after username/password verification

#### `POST /api/auth/2fa/disable`
- Disables 2FA for user
- Requires password verification for security

### User Management APIs

#### `POST /api/user/create`
- Admin-only endpoint
- Creates new user in database
- Automatically creates Luxor subaccount via proxy
- Sends welcome email if enabled
- Validates: email uniqueness, group selection, input format
- Role can be ADMIN or CLIENT
- Optional initial deposit creates cost payment entry

#### `GET /api/user/all`
- Admin-only endpoint
- Returns list of all users with:
  - Profile information
  - Miner count
  - Status (active/inactive based on last activity)
  - Join date

#### `GET /api/user/[id]`
- Fetches user profile by ID
- Client sees own profile, admin sees any profile

#### `PUT /api/user/[id]`
- Updates user profile fields
- Can update: city, country, DOB, phone, address, company, ID number, wallet address
- Admin can edit any user, client can edit own profile

#### `DELETE /api/user/[id]`
- Admin-only endpoint
- Cascades delete to related records (miners, cost payments, activities)
- Cannot delete last admin user

#### `GET /api/user/profile`
- Returns authenticated user's profile
- Used by AccountSettings page
- Includes 2FA status, activity log

#### `POST /api/user/change-password`
- Changes password for user
- Admin can change any user's password
- Client can change own password
- Returns temporary password if admin-initiated

#### `POST /api/user/forgot-password`
- Public endpoint for password reset
- Generates temporary password
- Sends password reset email
- User can login with temp password and change it

#### `POST /api/user/upload-image`
- Uploads profile picture to Cloudinary
- Returns image URL and ID
- Updates User.profileImage and User.profileImageId

#### `GET /api/user/balance`
- Returns user's current account balance
- Calculated from most recent CostPayment entry

### Cost Payments APIs

#### `GET /api/cost-payments`
- Fetches user's cost payment history
- Supports pagination: ?page=0&pageSize=10
- Returns formatted data with:
  - Date, Type, Consumption, Amount, Balance
  - Color-coded amounts and balances
  - Pagination info (totalCount, totalPages)

#### `POST /api/cost-payments`
- Admin-only endpoint
- Adds new PAYMENT or ELECTRICITY_CHARGES entry
- Automatically calculates balance based on type
- Response includes balance progression info
- Supports initial deposits when creating users

### Mining Data APIs

#### `GET /api/miners/user`
- Returns miners owned by authenticated user
- Client sees own miners only
- Admin can see any user's miners
- Includes space assignment

#### `GET /api/miners/daily-costs`
- Calculates daily electricity costs
- Takes power usage from miners
- Multiplies by current electricity rate
- Returns per-miner and total costs

#### `GET /api/workers/stats`
- Fetches live worker statistics from Luxor API
- Returns activeWorkers, inactiveWorkers, totalWorkers count
- Used by dashboard factory status card
- Requires user to have luxorSubaccountName set

#### `GET /api/btcprice`
- Fetches current BTC price in USD
- Used for balance/earning conversions
- Calls external price API (API Ninjas)
- Cached to prevent excessive API calls

### Admin Statistics APIs

#### `GET /api/admin/dashboard`
- Returns dashboard metrics for admin panel
- Total customers, active customers, total revenue
- Total miners across all customers
- Aggregates data from database and Luxor

### Luxor Proxy APIs

#### `GET /api/luxor?endpoint=...&operation=...&...`
- Universal proxy for all Luxor API endpoints
- Validates endpoint against allowlist
- Attaches Luxor API key server-side
- Returns standardized ProxyResponse format
- Supports different operations per endpoint

**Supported endpoints**:
- `workspace` - Get workspace information with groups
- `active-workers` - Get worker counts over time (requires currency)
- `hashrate-history` - Get hashrate metrics (requires currency)
- `workers` - Get worker list (requires currency)
- `group` - Group operations (create/update/delete/get)
- `subaccount` - Subaccount operations (admin-only)

### Spaces and Machines APIs

#### `GET /api/spaces`, `POST /api/spaces`, `PUT /api/spaces/[id]`, `DELETE /api/spaces/[id]`
- CRUD operations for mining spaces
- Space: name, location, capacity, power capacity, status

#### `GET /api/machine`, `POST /api/machine`, `PUT /api/machine/[id]`, `DELETE /api/machine/[id]`
- CRUD operations for miners/machines
- Miner: name, model, status, power usage, hash rate, assigned space and user

---

## 5. Luxor API Integration

### What is Luxor?

Luxor Mining Pool (https://app.luxor.tech) is a Bitcoin and altcoin mining pool. The API allows programmatic access to:
- Mining pool operations (workers, hashrate, efficiency)
- Workspace organization (groups for dividing miners)
- Subaccounts (separate mining operations within a group)
- Revenue and earnings data
- Worker performance metrics

### Luxor Base Endpoint
```
https://app.luxor.tech/api/v1
```

### Authentication to Luxor
- Uses `Authorization` header with API key (not `X-API-Key`)
- API key stored in `LUXOR_API_KEY` environment variable
- Key is server-side only, never exposed to client
- Passed through `/api/luxor` proxy route for safety

### Luxor Endpoints Used by BitFactory

#### Workspace Operations
- `GET /workspace` - Fetch workspace with all groups
- `POST /workspace/groups` - Create new group
- `PATCH /workspace/groups/{groupId}` - Rename group
- `DELETE /workspace/groups/{groupId}` - Delete group
- `GET /workspace/groups/{groupId}` - Get group details

#### Subaccount Operations
- `POST /pool/groups/{groupId}/subaccounts` - Add subaccount to group
- `DELETE /pool/groups/{groupId}/subaccounts/{subaccountName}` - Remove subaccount
- `GET /pool/groups/{groupId}/subaccounts` - List subaccounts in group

#### Worker Operations
- `GET /pool/workers/{currency}?subaccount_names=...` - Get workers for subaccount
  - Required params: `currency` (BTC, LTC, etc.), `subaccount_names`
  - Optional params: `page_number`, `page_size`, `status`
  - Returns: total_active, total_inactive, workers array with details

- `GET /pool/active-workers/{currency}?subaccount_names=...&start_date=...&end_date=...` - Get worker counts over time
  - Params: currency, subaccount_names, date range, tick_size
  - Returns: Historical active worker counts

#### Hashrate Operations
- `GET /pool/hashrate-efficiency/{currency}?subaccount_names=...` - Get hashrate metrics
  - Returns: Hashrate and efficiency data over time

### LuxorClient Library (`/src/lib/luxor.ts`)

A custom-built TypeScript client handling all Luxor API interactions:

**Features**:
- Server-side only execution (no client exposure)
- Structured error handling with `LuxorError` class
- Automatic URL building with query parameter encoding
- Comprehensive logging for debugging
- Type-safe responses with TypeScript generics
- Factory function `createLuxorClient()` for instantiation

**Key methods**:
- `request<T>(path, params?, method?, body?)` - Generic API call
- `getWorkspace()` - Fetch workspace with groups
- `createGroup()`, `updateGroup()`, `deleteGroup()`, `getGroup()`
- `addSubaccount()`, `removeSubaccount()`, `getSubaccount()`
- URL building with `buildUrl()` (private, for internal use)

**Usage pattern**:
```typescript
const client = createLuxorClient(subaccountName);
const workers = await client.request<WorkersResponse>(
  "/pool/workers/BTC",
  { subaccount_names: subaccountName, page_number: 1, page_size: 1000 }
);
```

### Luxor API Proxy Route (`/src/app/api/luxor/route.ts`)

A secure server-side proxy that:
1. Authenticates the user via JWT token
2. Validates the requested endpoint against allowlist
3. Attaches Luxor API key to the request
4. Forwards to Luxor with proper query parameters
5. Returns standardized response format

**Why a proxy?**:
- Luxor API key never exposed to client
- Client cannot make arbitrary Luxor API calls
- Single point of control for Luxor API usage
- Consistent error handling and response format
- Audit trail of all Luxor API calls

**Endpoint allowlist**:
- workspace, active-workers, hashrate-history, workers (all with proper param validation)
- group (CRUD operations)
- subaccount (admin-only CRUD operations)

### How Subaccount Creation Works

**Flow when admin creates user**:

1. **Admin page**: SelectGroup dropdown populated from `/api/luxor?endpoint=workspace`
2. **Admin selects**: One or more groups from dropdown
3. **Admin submits**: CreateUserModal with name, email, role, groupIds
4. **API /user/create**:
   - Creates User in database with name
   - For each groupId:
     - Calls `/api/luxor` proxy with:
       - endpoint: "subaccount"
       - operation: "add"
       - groupId: selected group
       - name: user's name (becomes subaccount name)
     - Proxy forwards to `POST /pool/groups/{groupId}/subaccounts`
     - Luxor creates subaccount and returns created subaccount object
     - Response includes subaccount name (may differ from requested if modified by Luxor)
   - Stores returned subaccount name in `User.luxorSubaccountName`
   - Sends welcome email with credentials

5. **Later, on login**:
   - Client fetches `/api/workers/stats`
   - API uses `User.luxorSubaccountName` to query Luxor workers
   - Returns live worker counts for dashboard

### Error Handling for Luxor API

**LuxorError class**:
- Captures HTTP status code, message, and response details
- Server-side logging with status info
- Client receives standardized error response
- Caller can handle specific error codes

**Common Luxor API errors**:
- 400: Bad Request (missing required params, invalid values)
- 401: Unauthorized (invalid API key)
- 403: Forbidden (user lacks permission for operation)
- 404: Not Found (resource doesn't exist)
- 500: Server Error (Luxor infrastructure issue)

**BitFactory error handling**:
- API routes catch LuxorError and return appropriate HTTP status
- Client components show error toast/alert to user
- Retry mechanism for transient failures
- Graceful degradation (show cached data if API fails)

### Why Hybrid Model is Necessary

1. **Security**: User credentials stored locally, mining operations on Luxor
2. **Data ownership**: BitFactory owns user data, Luxor owns mining data
3. **Real-time requirements**: Worker stats need live fetch from Luxor
4. **Billing and accounting**: Balance calculations are business logic, workers are pool data
5. **Scalability**: Luxor handles mining operations, BitFactory handles user management
6. **Flexibility**: Can migrate mining pools without changing user management

---

## 6. Database Architecture

### Prisma Schema Overview

The database uses PostgreSQL with Prisma ORM, providing type-safe database access with migrations.

### Core Models

#### User Model
```
id (String, CUID) - Primary key
email (String, unique) - Login credential
name (String, optional) - Display name and Luxor subaccount name
password (String) - bcryptjs hash
role (enum Role) - ADMIN or CLIENT
luxorSubaccountName (String, optional) - Reference to Luxor subaccount
twoFactorEnabled (Boolean) - 2FA status
twoFactorSecret (String, optional) - TOTP secret
twoFactorBackupCodes (String[]) - Recovery codes for 2FA
city, country (String, optional) - Address fields
dateOfBirth (DateTime, optional)
phoneNumber, streetAddress (String, optional)
companyName, idNumber (String, optional) - Business info
walletAddress (String, optional) - Crypto wallet for payouts
profileImage (String, optional) - Image URL from Cloudinary
profileImageId (String, optional) - Cloudinary image ID
createdAt, updatedAt (DateTime) - Timestamps
Relations:
  - blacklisted: TokenBlacklist[] (logout tokens)
  - activities: UserActivity[] (login logs)
  - miners: Miner[] (owned mining equipment)
  - costPayments: CostPayment[] (financial transactions)
```

#### CostPayment Model
```
id (String, CUID) - Primary key
userId (String) - Foreign key to User
amount (Float) - Transaction amount in USD
consumption (Float) - Electricity consumption in kWh
type (enum PaymentType) - PAYMENT or ELECTRICITY_CHARGES
balance (Float, optional) - Running account balance
createdAt (DateTime) - Transaction timestamp
Relations:
  - user: User (FK on userId)
Indexes:
  - userId (for fast filtering by user)
```

**Balance calculation logic**:
- When new CostPayment created:
  1. Fetch latest previous balance for user
  2. If PAYMENT type: `newBalance = previousBalance + amount`
  3. If ELECTRICITY_CHARGES type: `newBalance = previousBalance - amount`
  4. Store newBalance in record
  5. Result: each payment has running balance for quick display

#### Miner Model
```
id (String, CUID) - Primary key
name (String) - Miner name
model (String) - Hardware model
status (String) - ACTIVE or INACTIVE
powerUsage (Float) - Power consumption in kilowatts
hashRate (Float) - Mining power in TH/s
userId (String) - FK to User (owner)
spaceId (String) - FK to Space (location)
createdAt, updatedAt (DateTime)
Relations:
  - user: User
  - space: Space
```

#### Space Model
```
id (String, CUID) - Primary key
name (String) - Space name (e.g., "Data Center A")
location (String) - Physical location
capacity (Int) - Total mining spots available
powerCapacity (Float) - Total power available in kilowatts
status (String) - AVAILABLE or OCCUPIED
createdAt, updatedAt (DateTime)
Relations:
  - miners: Miner[]
```

#### TokenBlacklist Model
```
id (String, CUID) - Primary key
token (String, unique) - Blacklisted JWT
userId (String) - User who logged out
expiresAt (DateTime) - Token expiration time
createdAt (DateTime)
Relations:
  - user: User (FK)
Indexes:
  - token (for fast logout lookups)
```

#### UserActivity Model
```
id (String, CUID) - Primary key
userId (String) - User who performed action
type (String) - Activity type (LOGIN, CREATE_MINER, etc.)
ipAddress (String) - Source IP
userAgent (String) - Browser/client info
createdAt (DateTime)
Relations:
  - user: User (FK)
Indexes:
  - userId (for activity logs per user)
```

#### ElectricityRate Model
```
id (String, CUID) - Primary key
rate_per_kwh (Float) - Cost per kilowatt-hour
valid_from (DateTime) - When rate becomes active
created_at (DateTime)
Indexes:
  - valid_from (for quick historical rate lookup)
```

### Database Relations Diagram

```
User (1) ←→ (many) CostPayment
User (1) ←→ (many) Miner
User (1) ←→ (many) UserActivity
User (1) ←→ (many) TokenBlacklist
Space (1) ←→ (many) Miner
```

### Key Queries

**Get user with recent balance**:
```
User.findUnique(userId) with costPayments ordered desc by createdAt take 1
```

**Get user's miners with spaces**:
```
Miner.findMany(where userId) include space
```

**Calculate daily costs**:
```
Miner.findMany(where userId) sum(powerUsage) * ElectricityRate.latest()
```

**Track login activity**:
```
UserActivity.create(userId, "LOGIN", ipAddress, userAgent)
```

### Migrations

Migrations stored in `/prisma/migrations/` with dates:
- `20251129104931_add_luxor_subaccount_name` - Added luxorSubaccountName field to User
- `20251129120817_add_balance_to_cost_payments` - Added balance field to CostPayment
- Previous migrations for initial schema creation, 2FA fields, etc.

Each migration is idempotent and reversible via `npx prisma migrate reset`.

---

## 7. Security Measures

### JWT Authentication

**Token Structure**:
- Access token: 15 minutes expiry, contains userId and role
- Refresh token: 7 days expiry, used to get new access token
- Both stored as HTTP-only cookies (cannot be accessed by JavaScript)

**Token generation** (`generateTokens`):
- Uses jose library for JWT signing
- Payload includes: userId, role, iat (issued at), exp (expiration)
- Signed with JWT_ACCESS_TOKEN_SECRET and JWT_REFRESH_TOKEN_SECRET

**Token verification** (`verifyJwtToken`):
- Verifies signature against environment secret
- Checks expiration time
- Returns decoded payload (userId, role)
- Throws error if invalid

### Role-Based Access Control (RBAC)

**Roles**:
- ADMIN: Full access to manage customers, groups, workers, statistics
- CLIENT: Access to own dashboard, wallet, account settings

**Enforcement points**:
1. **Middleware** (`middleware.ts`):
   - ADMIN routed to `/manage/*`
   - CLIENT routed to `/auth/*`
   - Prevents wrong role from accessing pages

2. **API routes**:
   - Check `user.role` before allowing operations
   - Admin-only endpoints return 403 if not admin
   - Client endpoints filter results by userId

3. **Components**:
   - Conditionally render UI based on user role via AuthContext

**Example API check**:
```typescript
const user = await prisma.user.findUnique({...});
if (user?.role !== "ADMIN") {
  return NextResponse.json(
    { error: "Only administrators can add payments" },
    { status: 403 }
  );
}
```

### Password Security

**Hashing**:
- bcryptjs with salt rounds of 12
- Password never stored in plaintext
- Verified with timing-attack-resistant comparison

**Change password flow**:
- User provides old password
- API verifies old password matches hash
- New password hashed and stored
- Old tokens blacklisted (forces re-login)

**Forgot password flow**:
- User requests reset with email
- API generates temporary password (8 random characters)
- Temp password hashed and stored in database
- Email sent with temp password
- User logs in with temp password
- On login, prompted to set new password

### API Key Security (Luxor API Key)

**Storage**:
- Stored in `LUXOR_API_KEY` environment variable
- Never exposed in code or responses
- Only accessible server-side

**Usage**:
- Only used in `/api/luxor` proxy route
- Attached to Luxor API requests server-side
- Client never knows API key value
- All Luxor API calls go through proxy for audit trail

### Data Validation

**Input validation**:
- Email format checking (regex)
- Required field validation
- Type checking (string, number, array)
- Length limits on text fields
- Enum validation for role, type fields

**Output sanitization**:
- Sensitive fields excluded from responses (passwords, secrets)
- Only necessary data returned to client
- Error messages don't leak internal info

### Two-Factor Authentication (2FA)

**TOTP-based** (Time-based One-Time Password):
- Uses speakeasy library for TOTP generation
- 6-digit codes, 30-second time window
- QR code displayed during setup for authenticator app
- Backup codes (8 codes) provided for recovery
- Can be disabled by user with password verification

**Backup codes**:
- Generated as 8 random codes
- Stored in database
- Can be used instead of TOTP if authenticator lost
- One-time use only

### Session Management

**Logout flow**:
- Access token added to TokenBlacklist with expiration
- Cookies cleared on client
- Refresh token invalidated
- User redirected to login

**Token blacklist**:
- Checked on `/api/auth/check`
- Prevents use of old tokens after logout
- Entries expire automatically (garbage collection)

### Activity Logging

**UserActivity tracking**:
- Login attempts (IP, user agent)
- Failed access attempts
- Password changes
- 2FA setup/disable
- Major operations (user creation, deletion)

**Purpose**:
- Security audit trail
- Detect unusual activity
- User transparency in account settings

### Middleware Protections

**Request flow**:
```
1. Middleware intercepts all non-API requests
2. Verifies JWT token from cookies
3. Enforces role-based routing
4. Redirects based on role
5. API key never sent to client
6. Environment variables not leaked in responses
```

### CORS and Same-Origin Policy

**Setup**:
- Same-origin API calls (client and server on same domain)
- Cookies sent automatically in requests
- No explicit CORS configuration needed
- Prevents cross-site request forgery (CSRF)

### What Is NOT Stored Plaintext

- Passwords (bcryptjs hash)
- 2FA secrets (TOTP secret)
- Luxor API key (env var only)
- JWT signing secrets (env vars)
- Backup codes (encrypted if possible, not implemented currently)

---

## 8. Additional Directories

### Scripts (`/scripts/`)

**check-login-activities.js**: 
- Utility script to query login activity logs
- Useful for security audits
- Lists recent logins by user

**create-test-user.js**:
- Development script to create test users
- Populates database with sample data for testing
- Can create both ADMIN and CLIENT users

**create-user.ts**:
- TypeScript utility for programmatic user creation
- Used by seeding scripts
- Handles user creation and email sending

### Public Assets (`/public/`)

**Logos and images**:
- BitfactoryLogo.webp: Main application logo
- favicon.svg: Browser tab icon
- Other SVG/PNG assets for UI

**Where used**:
- Logo on login page and navbar
- Favicon on all pages
- Images in documentation

### Config Files

**tsconfig.json**:
- TypeScript configuration
- Path aliases: `@` points to `/src`
- Enables strict type checking
- Module resolution for imports

**next.config.ts**:
- Next.js configuration
- Image optimization settings
- Environment variable forwarding

**postcss.config.mjs**:
- PostCSS configuration for Tailwind
- CSS processing pipeline

**eslint.config.mjs**:
- ESLint rules for code quality
- TypeScript-aware linting
- Enforces best practices

**.env** (not in repo, local only):
- Database connection string
- JWT secrets
- Luxor API key
- Cloudinary credentials
- SMTP credentials
- API Ninjas key for BTC price
- Feature flags (2FA enabled)

### Shared Utilities and Constants

**Key lib files** (`/src/lib/`):
- `prisma.ts`: Prisma client singleton
- `jwt.ts`: Token generation and verification
- `luxor.ts`: Luxor API client and types
- `email.ts`: Email sending utilities (SMTP)
- `contexts/auth-context.tsx`: Global authentication state

**Auth context provides**:
- `user`: Current logged-in user object
- `login()`: Authenticate with email/password
- `logout()`: Clear session
- `isLoading`: Auth status loading state
- `checkAuth()`: Verify token validity

### Theme and Styling

**Theme provider** (`/src/app/theme-provider.tsx`):
- Creates MUI theme objects (light and dark)
- Provides `useTheme()` hook
- Global theme state management
- Used by all pages for consistent styling

**Global styles** (`/src/app/globals.css`):
- Tailwind CSS directives
- Global resets
- Custom CSS utilities

**Component styling**:
- Material-UI sx prop for styling
- Tailwind classes where applicable
- Responsive breakpoints (xs, sm, md, lg, xl)

---

## 9. User Lifecycle

### Admin Creating a User (User Registration Flow)

**Step 1: Access customer management**
- Admin navigates to `/manage/customers/overview`
- Clicks "Create User" button
- CreateUserModal opens

**Step 2: Fill form**
```
- Name: "john_doe" (used as Luxor subaccount name)
- Email: "john@example.com"
- Role: "CLIENT"
- Luxor Groups: [select one or more groups]
- Initial Deposit: 100 (optional)
- Send Welcome Email: checked
```

**Step 3: API /user/create processes request**
- Validates inputs
- Checks email not already in use
- Generates temporary password (e.g., "a7x9k2m1")
- Hashes password with bcryptjs
- Creates User in database:
  ```sql
  INSERT INTO users (id, email, name, password, role, ...)
  VALUES ("cuid_123", "john@example.com", "john_doe", "$2a$12$...", "CLIENT", ...)
  ```

**Step 4: Create Luxor subaccount**
- For each selected group:
  - Calls `/api/luxor` proxy
  - Proxy calls `POST /pool/groups/{groupId}/subaccounts`
  - Luxor creates subaccount with name "john_doe"
  - Returns created subaccount object
- Stores returned subaccount name in `User.luxorSubaccountName`

**Step 5: Create initial deposit (if provided)**
- If `initialDeposit > 0`:
  - Creates CostPayment entry:
    ```sql
    INSERT INTO cost_payments (userId, amount, type, consumption, balance)
    VALUES ("cuid_123", 100, "PAYMENT", 0, 100)
    ```

**Step 6: Send welcome email**
- Email service sends:
  - To: john@example.com
  - Subject: "Welcome to BitFactory"
  - Body: "Username: john@example.com, Temporary Password: a7x9k2m1"
  - Link to login page

**Step 7: User receives notification**
- Modal shows success message
- Customer list refreshes automatically
- New user visible in table

### User Logging In

**Step 1: Navigate to login**
- User goes to `/login` page
- Enters email and password

**Step 2: Authentication**
- Login page calls `POST /api/login`
- API finds user by email
- Verifies password with bcrypt
- If 2FA enabled: asks for TOTP code
- If 2FA disabled: generates tokens

**Step 3: Token generation**
- Creates access token (15 min expiry)
- Creates refresh token (7 days expiry)
- Sets cookies as HTTP-only
- Returns redirect URL based on role

**Step 4: Redirect and session**
- Client redirected to `/dashboard` (CLIENT) or `/adminpanel` (ADMIN)
- AuthProvider receives user object
- User state stored in React Context
- Middleware allows access to protected routes

**Step 5: Background auth checks**
- AuthProvider calls `checkAuth()` on mount
- Every 5 minutes, verifies token still valid
- If token expired: attempts refresh
- If refresh fails: logs out user

### User Accessing Dashboard (Client)

**Step 1: Load dashboard**
- Client navigates to `/dashboard`
- AppBar shows user name and logout button

**Step 2: Fetch worker stats**
- Dashboard page calls `GET /api/workers/stats`
- API uses `User.luxorSubaccountName` from database
- Creates LuxorClient with subaccount name
- Calls Luxor: `GET /pool/workers/BTC?subaccount_names=john_doe`
- Returns active/inactive worker counts

**Step 3: Display data**
- HostedMinersCard shows:
  - Active workers (green)
  - Inactive workers (red)
  - Progress bar
- Stats cards show balance and earnings
- Charts display historical data

**Step 4: Manual refresh**
- User can click refresh button
- Re-fetches worker stats from Luxor
- Shows loading spinner during fetch
- Updates card with new data

### User Checking Wallet

**Step 1: Navigate to wallet**
- Client clicks "My Wallet" in navbar
- Lands on `/wallet` page

**Step 2: Fetch payment history**
- ElectricityCostTable component mounts
- Calls `GET /api/cost-payments?page=0&pageSize=10`
- API queries CostPayment table filtered by userId
- Returns 10 most recent transactions

**Step 3: Display table**
- Rows show: Date, Type, Consumption, Amount, Balance
- Each row has running balance (progressive calculation)
- Sortable by any column
- Searchable by text
- Paginated for performance

**Step 4: Balance interpretation**
- Each payment updates balance
- PAYMENT: balance increases (green)
- ELECTRICITY_CHARGES: balance decreases (red)
- Running total visible for transparency

### User Changing Password

**Step 1: Access account settings**
- Client clicks profile icon → "Account Settings"
- Lands on `/account-settings` page

**Step 2: Change password**
- Form requires old password, new password, confirm new password
- User enters credentials

**Step 3: API validation**
- `POST /api/user/change-password` verifies old password
- Hashes new password with bcryptjs
- Updates User in database

**Step 4: Session invalidation**
- Current access token added to TokenBlacklist
- User must login again with new password
- Ensures old tokens can't be used

### Admin Managing Payments

**Step 1: Select customer**
- Admin on `/manage/customers/overview`
- Clicks menu icon → "Add Payment"
- AddPaymentModal opens for selected customer

**Step 2: Enter payment**
- Admin enters amount (USD)
- Selects type: PAYMENT or ELECTRICITY_CHARGES
- Submits form

**Step 3: API creates payment entry**
- `POST /api/cost-payments` with customerId
- Creates entry with `balance: null` initially
- Fetches latest previous balance
- Calculates new balance:
  - PAYMENT: `previousBalance + amount`
  - ELECTRICITY_CHARGES: `previousBalance - amount`
- Updates entry with calculated balance

**Step 4: Notification**
- Modal shows success
- Payment visible in wallet table for customer
- Customer sees updated balance next time viewing wallet

---

## 10. Admin Workflow Summary

### Primary Admin Capabilities

**1. User Management**
- Create users with email and name
- Assign users to Luxor groups
- Edit user profile information
- Change user password
- Delete user accounts
- View all users and their metrics

**2. Payment and Balance Management**
- Add payments to user accounts (increases balance)
- Add electricity charges (decreases balance)
- View payment history per user
- Track running balances
- Export transaction reports

**3. Luxor Group Management**
- Create mining groups in Luxor workspace
- Rename groups
- Delete groups
- View group composition (members, subaccounts)
- Organize miners by group

**4. Luxor Subaccount Management**
- View all subaccounts within groups
- Add subaccounts to groups
- Remove subaccounts from groups
- Track subaccount creation dates
- Link subaccounts to users

**5. Worker Management**
- View all miners and their worker status
- Filter workers by subaccount, status, model
- See worker performance metrics (hashrate, efficiency)
- Track shares (stale, rejected)
- Monitor last share time

**6. Infrastructure Management**
- Create and manage mining spaces (data centers, locations)
- Create and manage miners (hardware inventory)
- Assign miners to spaces
- Track power capacity and usage
- Set miner status (ACTIVE/INACTIVE)

**7. Reporting and Analytics**
- View admin dashboard with aggregate statistics
- Total customers count
- Active customers count
- Total revenue across all customers
- Total miners deployed
- Customer growth charts
- Miner performance trends

**8. Security and Monitoring**
- View user login activity logs
- See login attempts (IP, time, browser)
- Monitor for suspicious activity
- Review user creation audit trail

### Admin Page Navigation

```
/adminpanel (Admin Dashboard)
├─ /manage/customers/overview (Customer Management)
├─ /manage/groups (Luxor Group Management)
├─ /manage/subaccounts (Luxor Subaccount Management)
├─ /manage/workers (Worker Monitoring)
├─ /manage/space (Mining Space Management)
├─ /manage/machine (Miner/Hardware Management)
└─ Account Settings (Profile, 2FA, Activity Logs)
```

---

## 11. Client Workflow Summary

### Primary Client Capabilities

**1. Dashboard View**
- See live worker status (active/inactive counts)
- Factory status card with progress visualization
- Account balance display
- Earnings metrics
- Worker performance charts

**2. Wallet and Balance Management**
- View complete transaction history
- See all payments and electricity charges
- Track running balance progression
- Search and filter transactions
- Pagination through transaction history
- Export data if needed

**3. Miner Management**
- View list of owned miners
- See miner status (active/inactive)
- View power usage and hash rate
- See assigned mining space
- Add new miners

**4. Account Management**
- Update profile information (address, phone, company, etc.)
- Upload profile picture
- Change password
- Enable/disable two-factor authentication
- View login activity history
- See 2FA backup codes for recovery

**5. Security**
- Set up and manage 2FA
- View login history with IP and timestamp
- Monitor account access
- Logout from account settings

### Client Page Navigation

```
/dashboard (Main Dashboard)
├─ /wallet (Wallet and Transaction History)
├─ /miners (My Miners)
└─ /account-settings (Profile, 2FA, Security)
```

### Client Data Visibility and Restrictions

**Each client sees only**:
- Their own miners (filtered by userId)
- Their own transactions (filtered by userId)
- Their own profile information
- Their own login activity
- Their own workers/subaccounts from Luxor

**Restrictions enforced by**:
1. Middleware: Prevents CLIENT from accessing `/manage/*` routes
2. API routes: Filter database queries by userId
3. Frontend: Hidden UI elements for non-admin users

---

## 12. Key Implementation Patterns

### Server-Side API Key Management

**Pattern**: All external API keys stay server-side
```typescript
// ❌ Never do this (exposes key to client)
const luxorKey = process.env.LUXOR_API_KEY;
response.json({ apiKey: luxorKey });

// ✅ Do this (key only used server-side)
const response = await fetch(luxorUrl, {
  headers: { Authorization: process.env.LUXOR_API_KEY }
});
return NextResponse.json({ success: true });
```

### Balance Calculation on Payment Creation

**Pattern**: Calculate derived data immediately, don't compute on read
```typescript
// Create payment with null balance
const payment = await prisma.costPayment.create({
  data: { userId, amount, type, balance: null }
});

// Fetch previous balance
const prev = await prisma.costPayment.findFirst({
  where: { userId },
  skip: 1,
  orderBy: { createdAt: "desc" }
});

// Calculate new balance
const newBalance = type === "PAYMENT" 
  ? (prev?.balance || 0) + amount 
  : (prev?.balance || 0) - amount;

// Update payment with calculated balance
await prisma.costPayment.update({
  where: { id: payment.id },
  data: { balance: newBalance }
});
```

### Role-Based Middleware Routing

**Pattern**: Check role in middleware, redirect accordingly
```typescript
if (userRole === "ADMIN" && isInRouteGroup(pathname, "auth")) {
  // Admin tried to access client route
  return NextResponse.redirect(new URL("/adminpanel", request.url));
}

if (userRole === "CLIENT" && isInRouteGroup(pathname, "manage")) {
  // Client tried to access admin route
  return NextResponse.redirect(new URL("/dashboard", request.url));
}
```

### JWT Token Refresh

**Pattern**: Access token short-lived, refresh token longer
```typescript
// Access token: 15 minutes
// Refresh token: 7 days

// On each request:
// 1. Check if access token valid
// 2. If expired, use refresh token to get new access token
// 3. If refresh token invalid, redirect to login
// 4. Blacklist access token on logout
```

### Type-Safe Luxor Responses

**Pattern**: Use TypeScript generics for Luxor API responses
```typescript
interface WorkersResponse {
  total_active: number;
  total_inactive: number;
  workers: Worker[];
}

const workersData = await client.request<WorkersResponse>(
  "/pool/workers/BTC",
  params
);

// workersData is now typed as WorkersResponse
const activeCount = workersData.total_active; // ✅ Type-safe
```

---

## Summary

BitFactory is a comprehensive mining operation management platform that bridges user management and mining pool operations through a secure hybrid architecture. The local database handles user authentication, permissions, and financial tracking, while the Luxor API integration provides real-time mining metrics and operational data. The security model ensures API keys and authentication tokens never reach the client, role-based access control restricts functionality, and comprehensive logging provides audit trails for compliance and monitoring.

