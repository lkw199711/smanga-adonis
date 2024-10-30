import { compressImageToSize } from '#utils/sharp'
export default async function handle({ inputPath, outputPath, maxSizeKB }: any) {
    compressImageToSize(inputPath, outputPath, maxSizeKB)
}