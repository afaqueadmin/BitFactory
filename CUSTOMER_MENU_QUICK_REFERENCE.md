# Customer Menu Feature - Quick Reference Guide

## How to Use

### Access the Feature
1. Navigate to `/customers/overview` (Admin panel)
2. Scroll to the "Recent Customers" table

### Edit Customer Details
1. Click the **⋮** (three-dot menu) on any customer row
2. Select **"Edit Customer"**
3. A modal will open with the customer's current information
4. Update any fields (except email which is disabled)
5. Click **"Update"** to save
6. A green success notification will appear

### Change Customer Password
1. Click the **⋮** (three-dot menu) on any customer row
2. Select **"Change Password"**
3. A modal will open with password fields
4. Enter the new password
5. Confirm the new password (must match)
6. Click **"Change Password"** to save
7. A green success notification will appear

### Add Payment (Future Feature)
- Currently shows as a menu option
- Placeholder for payment flow implementation

## Fields That Can Be Edited

- **Name** - Customer's full name
- **Phone Number** - Contact number
- **Company Name** - Business name
- **Street Address** - Physical address
- **City** - City of residence
- **Country** - Country of residence
- **Wallet Address** - Cryptocurrency wallet (26-35 characters)

## API Endpoints

### Update Customer
```
PUT /api/user/[customerId]
Headers: { Authorization: "Bearer {token}" }
Body: {
  name: string,
  phoneNumber: string,
  companyName: string,
  streetAddress: string,
  city: string,
  country: string,
  walletAddress: string
}
```

### Change Password
```
PUT /api/user/[customerId]/change-password
Headers: { Authorization: "Bearer {token}" }
Body: {
  newPassword: string
}
```

## Error Handling

- **Network errors**: Shows red alert with error message
- **Validation errors**: Shows specific error (e.g., "Password must be at least 6 characters")
- **Authorization errors**: Returns 403 if non-admin user attempts access
- **Server errors**: Shows generic error message

## Key Features

✅ **Real-time validation** - Password matching, length checks
✅ **Secure** - JWT authentication, password hashing with bcryptjs
✅ **User-friendly** - Modal dialogs, loading states, success notifications
✅ **Responsive** - Works on all screen sizes
✅ **Admin-only** - Requires admin role to access

## Testing Checklist

- [ ] Edit customer and verify fields update in database
- [ ] Change password and verify login fails with old password
- [ ] Verify email field cannot be edited
- [ ] Test with invalid data (e.g., short password)
- [ ] Confirm success notifications appear and auto-dismiss
- [ ] Check that non-admin users cannot access endpoints
- [ ] Verify all form validations work correctly

## Troubleshooting

**Modal won't open?**
- Check browser console for errors
- Verify user is logged in and has admin role
- Check network tab to ensure API calls are working

**Changes not saving?**
- Verify JWT token is valid
- Check database connection
- Look for error messages in console

**Add Payment option not working?**
- This is intentionally a placeholder for future implementation
- You can click it without issues, but no action will occur

