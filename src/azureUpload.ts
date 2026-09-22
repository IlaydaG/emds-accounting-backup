import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';
import crypto from 'crypto';
import fs from 'fs';

export async function getContainerClient(containerName: string): Promise<ContainerClient> {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING as string;
  const service = BlobServiceClient.fromConnectionString(connectionString);
  const container = service.getContainerClient(containerName);
  await container.createIfNotExists();
  return container;
}

function sha256Of(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export interface UploadResult {
  blobPath: string;
  verified: boolean;
}

export async function uploadFile(
  container: ContainerClient,
  localPath: string,
  blobPath: string,
  expectedSha256: string
): Promise<UploadResult> {
  const blockBlob = container.getBlockBlobClient(blobPath);
  await blockBlob.uploadFile(localPath);

  const downloaded = await blockBlob.downloadToBuffer();
  const verified = sha256Of(downloaded) === expectedSha256;

  return { blobPath, verified };
}
