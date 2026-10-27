import release from '../../../android-release.json';
export const dynamic='force-static';
// The latest Android release, from the same file the APK build reads its version from.
// Public and cacheable: it holds no user data.
export function GET(){return Response.json({android:{versionName:release.versionName,versionCode:release.versionCode}},{headers:{'Cache-Control':'public, max-age=300'}})}
