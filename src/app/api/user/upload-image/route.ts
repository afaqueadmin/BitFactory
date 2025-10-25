import { v2 as cloudinary } from 'cloudinary';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import { verifyJwtToken } from '@/lib/jwt';

// Add runtime config for Node.js runtime
export const runtime = 'nodejs';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

export async function POST(req: Request) {
  try {
    console.log('Starting image upload process...');
    
    // Check authentication
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    
    console.log('Token found:', !!token);
    
    if (!token) {
      return Response.json({ error: 'Unauthorized - No token found' }, { status: 401 });
    }

    let decodedToken;
    try {
      decodedToken = await verifyJwtToken(token);
      console.log('Token verified successfully:', decodedToken);
    } catch (error) {
      console.error('Token verification error:', error);
      return Response.json({ error: 'Invalid token - Verification failed' }, { status: 401 });
    }

    const userId = decodedToken.userId;
    if (!userId) {
      return Response.json({ error: 'Invalid token - Missing user ID' }, { status: 401 });
    }

    // Get user email from database
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true }
    });

    if (!user?.email) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    const userEmail = user.email;

    const formData = await req.formData();
    const file = formData.get('image') as File;
    
    console.log('File received:', {
      type: file.type,
      size: file.size,
      name: file.name
    });
    
    // Validate file size (max 10MB for free tier)
    if (file.size > 10 * 1024 * 1024) {
      return Response.json(
        { error: 'File size must be less than 10MB' },
        { status: 400 }
      );
    }

    // Convert file to base64
    let base64String;
    try {
      const fileBuffer = await file.arrayBuffer();
      base64String = Buffer.from(fileBuffer).toString('base64');
      console.log('File converted to base64 successfully');
    } catch (error) {
      console.error('File conversion error:', error);
      return Response.json(
        { error: 'Failed to process image file' },
        { status: 400 }
      );
    }
    
    // Upload to Cloudinary with optimizations
    let result;
    try {
      console.log('Starting Cloudinary upload...');
      result = await cloudinary.uploader.upload(
        `data:${file.type};base64,${base64String}`,
        {
          folder: 'user-profiles',
          transformation: [
            { width: 400, height: 400, crop: 'fill', gravity: 'face' },
            { quality: 'auto' },
            { fetch_format: 'auto' }
          ],
          allowed_formats: ['jpg', 'png', 'jpeg', 'gif', 'webp'],
          public_id: `user_${Date.now()}`
        }
      );
      console.log('Cloudinary upload successful:', {
        url: result.secure_url,
        publicId: result.public_id
      });
    } catch (error) {
      console.error('Cloudinary upload error:', error);
      return Response.json(
        { error: 'Failed to upload image to cloud storage' },
        { status: 500 }
      );
    }

    // Update user profile in database
    try {
      console.log('Updating user profile with image:', userEmail);
      const updatedUser = await prisma.$queryRaw`
        UPDATE users 
        SET "profileImage" = ${result.secure_url}, 
            "profileImageId" = ${result.public_id}
        WHERE email = ${userEmail}
        RETURNING id, email
      `;
      console.log('Database update successful:', updatedUser);

      return Response.json({ 
        imageUrl: result.secure_url,
        publicId: result.public_id
      });
    } catch (error) {
      console.error('Database update error:', error);
      return Response.json(
        { error: 'Failed to update user profile' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Upload error:', error);
    return Response.json(
      { error: 'Failed to upload image' },
      { status: 500 }
    );
  }
}