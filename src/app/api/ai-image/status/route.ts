export async function GET() {
  const enabled = !!process.env.FAL_KEY;

  return Response.json({
    enabled,
    estimatedCostPerImage: 0.003,
  });
}
