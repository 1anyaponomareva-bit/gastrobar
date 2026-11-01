import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { mergeRecipes, type Recipe } from "@/data/recipes";
import { getSessionEmail } from "@/lib/recipes-admin/auth";
import { extractRecipeFromImage, type Box } from "@/lib/recipes-admin/gemini";
import { slugify } from "@/lib/recipes-admin/recipeInput";
import { readStoredRecipes, uploadRecipePhoto } from "@/lib/recipes-admin/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
/** Trims step-number badges and frame lines that touch the edges of detected photos. */
const BOX_INSET = 0.025;

async function cropPhoto(image: Buffer, width: number, height: number, box: Box | null): Promise<Buffer | null> {
  if (!box || box.length !== 4) return null;
  const [y0, x0, y1, x1] = box.map((value) => Math.min(1000, Math.max(0, value)));
  const insetX = (x1 - x0) * BOX_INSET;
  const insetY = (y1 - y0) * BOX_INSET;
  const left = Math.round(((x0 + insetX) / 1000) * width);
  const top = Math.round(((y0 + insetY) / 1000) * height);
  const cropWidth = Math.round(((x1 - x0 - 2 * insetX) / 1000) * width);
  const cropHeight = Math.round(((y1 - y0 - 2 * insetY) / 1000) * height);
  if (cropWidth < 20 || cropHeight < 20) return null;
  return sharp(image)
    .extract({ left, top, width: Math.min(cropWidth, width - left), height: Math.min(cropHeight, height - top) })
    .resize({ width: 1200, withoutEnlargement: true })
    .jpeg({ quality: 86 })
    .toBuffer();
}

export async function POST(request: Request) {
  try {
    if (!(await getSessionEmail())) return NextResponse.json({ error: "auth" }, { status: 401 });

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof Blob) || !file.size || file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "file" }, { status: 400 });
    }

    const image = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate()
      .resize({ width: 3000, height: 3000, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 92 })
      .toBuffer();
    const { width = 0, height = 0 } = await sharp(image).metadata();

    const extracted = await extractRecipeFromImage(image, "image/jpeg");

    const existing = new Set(mergeRecipes(await readStoredRecipes()).map((recipe) => recipe.id));
    let id = slugify(extracted.name.en || extracted.name.ru) || "recipe";
    if (existing.has(id)) id = `${id}-${randomBytes(2).toString("hex")}`;
    const stamp = Date.now();

    const upload = async (name: string, box: Box | null) => {
      const jpeg = await cropPhoto(image, width, height, box);
      return jpeg ? uploadRecipePhoto(`${id}/${name}-${stamp}.jpg`, jpeg) : undefined;
    };

    const [heroPhoto, ...stepPhotos] = await Promise.all([
      upload("hero", extracted.heroBox),
      ...extracted.steps.map((step, index) => upload(`step-${index + 1}`, step.photoBox)),
    ]);

    const recipe: Recipe = {
      id,
      kind: extracted.kind,
      name: extracted.name,
      meta: { cardNo: extracted.cardNo, date: extracted.date, revision: extracted.revision },
      ...(heroPhoto ? { photo: heroPhoto } : {}),
      yield: { amount: extracted.yieldAmount, unit: extracted.yieldUnit, label: extracted.yieldLabel },
      facts: extracted.facts,
      ingredients: extracted.ingredients.map((ingredient) => ({
        name: ingredient.name,
        amount: ingredient.net,
        unit: ingredient.unit,
        ...(ingredient.gross !== null && ingredient.gross !== ingredient.net ? { gross: ingredient.gross } : {}),
      })),
      steps: extracted.steps.map((step, index) => ({
        title: step.title,
        ...(stepPhotos[index] ? { photo: stepPhotos[index] } : {}),
        items: step.items,
      })),
      storage: extracted.storage.map((rule) => ({
        icon: rule.icon,
        title: rule.title,
        ...(rule.text ? { text: rule.text } : {}),
      })),
    };

    return NextResponse.json({ recipe });
  } catch (error) {
    console.error("[recipes-admin] import", error);
    return NextResponse.json({ error: "import" }, { status: 500 });
  }
}
