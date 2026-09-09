import { readBlockConfig } from '../../scripts/aem.js';

const DEFAULT_PLACEHOLDER_IMAGE = '/icons/profile-image-upload.svg';
const LOCAL_REFERENCE_BASE_URL = 'https://dsn-upload.s3.us-east-2.amazonaws.com/projects/we-healthcare';

function createReferenceObject(value) {
  return value ? { _id: value } : null;
}

function sanitizePathSegment(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'image';
}

function createLocalAssetPath(file) {
  const randomId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${LOCAL_REFERENCE_BASE_URL}/onboarding${randomId}-${sanitizePathSegment(file?.name)}`;
}

function updateProfilePictureLink(profilePictureLink) {
  if (typeof window === 'undefined' || typeof window.updateDataLayer !== 'function' || !profilePictureLink) return;
  window.updateDataLayer({ profilePictureLink });
}

function toDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Unable to read selected file'));
    reader.readAsDataURL(file);
  });
}

export default function decorate(block) {
  const config = readBlockConfig(block) || {};
  block.textContent = '';
  const uploadState = {
    previewSrc: '',
    uploadedUrl: '',
    profilePictureLink: null,
  };

  const customClass = config['custom-class']?.trim();
  if (customClass) block.classList.add(...customClass.split(/\s+/));

  const titleText = (config.title || 'Upload your photo').toString().trim();
  const primaryLabel = (config['primary-button-label'] || 'Take a Photo').toString().trim();
  const secondaryLabel = (config['secondary-button-label'] || 'Or choose from the gallery').toString().trim();
  const placeholderImage = (config['placeholder-image'] || DEFAULT_PLACEHOLDER_IMAGE).toString().trim();

  const title = document.createElement('h1');
  title.className = 'hup-title';
  title.textContent = titleText;

  const frame = document.createElement('div');
  frame.className = 'hup-photo-frame';

  const setPreviewImage = (src) => {
    if (!src) return;
    uploadState.previewSrc = src;
    frame.querySelector('.hup-photo-placeholder')?.remove();

    let img = frame.querySelector('img.hup-photo-preview');
    if (!img) {
      img = document.createElement('img');
      img.className = 'hup-photo-preview';
      img.alt = 'Uploaded photo preview';
      frame.append(img);
    }

    img.src = src;
  };

  const placeholder = document.createElement('img');
  placeholder.className = 'hup-photo-placeholder';
  placeholder.src = placeholderImage;
  placeholder.alt = '';
  placeholder.setAttribute('aria-hidden', 'true');
  frame.append(placeholder);

  const uploadStatus = document.createElement('p');
  uploadStatus.className = 'hup-upload-status';
  uploadStatus.setAttribute('aria-live', 'polite');

  const setUploadStatus = (message, statusClass = '') => {
    uploadStatus.textContent = message || '';
    uploadStatus.className = `hup-upload-status ${statusClass}`.trim();
  };

  const cameraInput = document.createElement('input');
  cameraInput.type = 'file';
  cameraInput.accept = 'image/*';
  cameraInput.capture = 'user';
  cameraInput.className = 'hup-visually-hidden';

  const galleryInput = document.createElement('input');
  galleryInput.type = 'file';
  galleryInput.accept = 'image/*';
  galleryInput.className = 'hup-visually-hidden';

  const onFileChosen = async (file) => {
    if (!file) return;
    try {
      const imageDataUrl = await toDataUrl(file);
      const localAssetPath = createLocalAssetPath(file);
      setPreviewImage(imageDataUrl);
      const profilePictureLink = createReferenceObject(localAssetPath);

      takePhotoBtn.disabled = true;
      galleryBtn.disabled = true;
      setUploadStatus('Image selected successfully.', 'is-success');

      uploadState.uploadedUrl = localAssetPath;
      uploadState.profilePictureLink = profilePictureLink;
      block.dataset.uploadUrl = localAssetPath;
      updateProfilePictureLink(profilePictureLink);

      block.dispatchEvent(new CustomEvent('healthcare-upload-photo:upload-success', {
        bubbles: true,
        detail: {
          uploadedUrl: localAssetPath,
          previewSrc: imageDataUrl,
          profilePictureLink,
          localOnly: true,
        },
      }));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('healthcare-upload-photo file read failed', error);
      setUploadStatus('Image selection failed. Please try again.', 'is-error');
      block.dispatchEvent(new CustomEvent('healthcare-upload-photo:upload-failure', {
        bubbles: true,
        detail: { message: error?.message || 'Image selection failed' },
      }));
    } finally {
      takePhotoBtn.disabled = false;
      galleryBtn.disabled = false;
    }
  };

  cameraInput.addEventListener('change', () => onFileChosen(cameraInput.files?.[0]));
  galleryInput.addEventListener('change', () => onFileChosen(galleryInput.files?.[0]));

  const takePhotoBtn = document.createElement('button');
  takePhotoBtn.type = 'button';
  takePhotoBtn.className = 'hup-btn hup-btn-primary';
  takePhotoBtn.textContent = primaryLabel;
  takePhotoBtn.addEventListener('click', () => cameraInput.click());

  const galleryBtn = document.createElement('button');
  galleryBtn.type = 'button';
  galleryBtn.className = 'hup-link-btn';
  galleryBtn.textContent = secondaryLabel;
  galleryBtn.addEventListener('click', () => galleryInput.click());

  block.append(title, frame, cameraInput, galleryInput, takePhotoBtn, galleryBtn, uploadStatus);
}
