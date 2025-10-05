import AdminPanel from './AdminPanel';

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ fid?: string }>;
}) {
  const params = await searchParams;
  const fid = params.fid;
  
  if (!fid) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-6">
        <div className="text-center text-white max-w-md">
          <h2 className="text-2xl font-bold mb-4 text-red-500">Unauthorized</h2>
          <p className="text-gray-400">You don&apos;t have admin access.</p>
        </div>
      </div>
    );
  }

  const adminFids = process.env.ADMIN_FID_1?.split(',').map(f => parseInt(f.trim())) || [];
  const isAdmin = adminFids.includes(parseInt(fid));

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-6">
        <div className="text-center text-white max-w-md">
          <h2 className="text-2xl font-bold mb-4 text-red-500">Unauthorized</h2>
          <p className="text-gray-400">You don&apos;t have admin access.</p>
        </div>
      </div>
    );
  }

  return <AdminPanel />;
}