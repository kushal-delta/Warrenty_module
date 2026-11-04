import { NextRequest } from "next/server";
import { saveServiceCall } from "@/lib/services/saveServiceCall";
export async function POST(request: NextRequest) { return saveServiceCall(request, true); }
