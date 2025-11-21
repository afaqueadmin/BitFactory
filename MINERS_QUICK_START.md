# Miners Management - Quick Start Guide

## Accessing the Feature

Navigate to `/machine` in the admin panel to access the Miners Management page.

## Features Overview

### 1. View All Miners
The page displays:
- **Statistics Dashboard** showing:
  - Total number of miners
  - Number of active miners
  - Total hash rate across all miners (TH/s)
  - Total power consumption (kW)
- **Miners Table** with columns:
  - Miner Name
  - Model
  - Owner (User)
  - Location (Space)
  - Power Usage (kW)
  - Hash Rate (TH/s)
  - Status (Active/Inactive)
  - Created Date
  - Actions (Edit/Delete)

### 2. Create a New Miner

**Steps:**
1. Click the **"Add Miner"** button in the top right
2. Fill in the form fields:
   - **Miner Name/ID** - Unique identifier (e.g., "Miner-001")
   - **Miner Model** - Equipment model (e.g., "Antminer S21")
   - **Power Usage** - Consumption in kilowatts (must be > 0)
   - **Hash Rate** - Performance in TH/s (must be > 0)
   - **User** - Select the owner from dropdown
   - **Space** - Select the hosting space from dropdown
   - **Status** - Set to Active or Inactive (defaults to Inactive)
3. Click **"Create Miner"** button
4. Form closes and table updates automatically

### 3. Edit an Existing Miner

**Steps:**
1. Click the **edit icon** (pencil) in the Actions column
2. Modal opens with current miner data pre-filled
3. Modify any fields as needed
4. Click **"Update Miner"** button
5. Changes are saved and table updates

### 4. Delete a Miner

**Steps:**
1. Click the **delete icon** (trash) in the Actions column
2. Confirmation dialog appears with warning
3. Click **"Delete"** button to confirm
4. Miner is removed from database and table updates
5. Or click **"Cancel"** to abort deletion

## Form Validation

The form validates:
- All required fields must be filled
- Power usage and hash rate must be positive numbers
- User and space must be selected from available options
- Form prevents submission with invalid data
- Error messages guide users to fix issues

## Data Persistence

- All changes are immediately saved to the database
- Data persists across page refreshes
- Changes are atomic (all or nothing)
- Historical data is maintained (createdAt timestamps)

## Error Handling

If an error occurs:
- Error message is displayed with details
- Operations are safely rolled back
- User can retry the operation
- A "Retry" button appears on load failures

## Permissions

- **Admin Access Only** - Must have ADMIN role
- **Authentication Required** - Valid JWT token in cookies
- Non-admin users cannot access this page

## Data Relationships

- **User** - Each miner must be assigned to a user who owns it
- **Space** - Each miner must be placed in a mining space
- Deleting a user or space doesn't automatically delete miners (data consistency)

## Performance Notes

- Table displays all miners (pagination available in future)
- Large datasets load efficiently due to database query optimization
- Sorting available on most columns via API query parameters
- Real-time updates when data changes

## Troubleshooting

### Page shows "Loading..."
- Wait for data to load from database
- Check internet connection
- Verify authentication is valid

### Form won't submit
- Check all required fields are filled
- Verify numeric values are positive
- Ensure user and space are selected
- Check for validation error messages

### Delete operation fails
- Confirm miner ID exists
- Check user has admin permissions
- Database constraints are met

### Changes don't appear
- Refresh the page manually
- Wait for auto-refresh (happens after operations)
- Check browser console for API errors

## API Integration

The page uses these endpoints:
- `GET /api/machine` - Fetch all miners
- `POST /api/machine` - Create new miner
- `PUT /api/machine/[id]` - Update miner
- `DELETE /api/machine/[id]` - Delete miner
- `GET /api/spaces` - Fetch available spaces
- `GET /api/user/all` - Fetch available users

All endpoints require valid admin JWT token.
