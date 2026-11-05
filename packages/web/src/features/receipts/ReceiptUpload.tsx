import { useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useMutation } from 'urql';
import { Button } from '../../components/ui/button';
import type { Maybe } from '../../lib/types';
import { mutationError } from '../pantry/queries';
import { UploadReceiptMutation } from './queries';

// The server's limits (uploadReceipt), checked here too so a phone does not send 30 MB to be told no.
const MAX_PHOTOS = 10;
const MAX_PHOTO_BYTES = 25 * 1024 * 1024;

/** A picked photo and a key of its own: two camera shots can share a name, and a removal shifts positions. */
interface PickedPhoto {
  key: number;
  file: File;
}

const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function photosProblem(photos: readonly File[]): Maybe<string> {
  if (photos.length > MAX_PHOTOS) return `A receipt can have at most ${String(MAX_PHOTOS)} photos.`;
  const notImage = photos.find((photo) => !photo.type.startsWith('image/'));
  if (notImage) return `${notImage.name} is not an image.`;
  const tooBig = photos.find((photo) => photo.size > MAX_PHOTO_BYTES);
  if (tooBig) return `${tooBig.name} is ${megabytes(tooBig.size)}; a photo can be at most 25 MB.`;
  return null;
}

/**
 * Photos are collected before sending, so a phone can take one shot per part of a long receipt
 * with the camera that `capture` opens, then upload them together in order.
 */
export function ReceiptUpload({ onUploaded }: { onUploaded: () => void }) {
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const nextKey = useRef(0);
  const [error, setError] = useState<Maybe<string>>(null);
  const [{ fetching }, upload] = useMutation(UploadReceiptMutation);
  const ids = useId();
  const inputId = `${ids}-photos`;
  const hintId = `${ids}-hint`;

  function addPhotos(event: ChangeEvent<HTMLInputElement>) {
    const added = [...(event.target.files ?? [])].map((file) => ({
      key: (nextKey.current += 1),
      file,
    }));
    // Cleared so the same file, or the next camera shot, fires another change.
    event.target.value = '';
    setPhotos((current) => [...current, ...added]);
    setError(null);
  }

  function removePhoto(key: number) {
    setPhotos((current) => current.filter((photo) => photo.key !== key));
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const files = photos.map((photo) => photo.file);
    const problem = photosProblem(files);
    if (problem) {
      setError(problem);
      return;
    }
    const result = await upload({ images: files });
    const message = result.data
      ? mutationError(result.data.uploadReceipt)
      : (result.error?.message ?? 'Something went wrong');
    if (message) {
      setError(message);
      return;
    }
    setPhotos([]);
    setError(null);
    onUploaded();
  }

  return (
    <form
      className="space-y-3 rounded-xl border p-4"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium" htmlFor={inputId}>
          Receipt photos
        </label>
        <input
          id={inputId}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          aria-describedby={hintId}
          className="text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm"
          onChange={addPhotos}
        />
        <p id={hintId} className="text-xs text-muted-foreground">
          A long receipt can take several photos: add them top to bottom. Up to {String(MAX_PHOTOS)}{' '}
          photos, 25 MB each.
        </p>
      </div>

      {photos.length > 0 && (
        <ol className="space-y-1 text-sm" aria-label="Photos to upload">
          {photos.map(({ key, file }, index) => (
            <li key={key} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate">
                {String(index + 1)}. {file.name} ({megabytes(file.size)})
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Remove photo ${String(index + 1)}, ${file.name}`}
                onClick={() => {
                  removePhoto(key);
                }}
              >
                Remove
              </Button>
            </li>
          ))}
        </ol>
      )}

      <Button type="submit" disabled={photos.length === 0 || fetching}>
        {fetching ? 'Uploading…' : 'Upload receipt'}
      </Button>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
