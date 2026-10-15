import { readFile, writeFile, mkdir, chmod } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function createInstaller({ releaseDirectory, outputDirectory, repository, releaseTag, version }) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || !/^[\w.-]+$/.test(releaseTag) || !/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid installer metadata.');
  const template = await readFile(new URL('../installer/Installation.command', import.meta.url), 'utf8');
  const replacements = { RELEASE_TAG: releaseTag, VERSION: version, REPOSITORY: repository };
  for (const architecture of ['arm64', 'x64']) {
    const archive = await readFile(path.join(releaseDirectory, `Structogram-ADS-${version}-${architecture}.zip`));
    replacements[architecture.toUpperCase() + '_SHA256'] = createHash('sha256').update(archive).digest('hex');
  }
  const script = template.replace(/@([A-Z0-9_]+)@/g, (_match, name) => {
    if (!(name in replacements)) throw new Error('Missing installer metadata: ' + name);
    return replacements[name];
  });
  await mkdir(outputDirectory, { recursive: true });
  const destination = path.join(outputDirectory, 'Installation.command');
  await writeFile(destination, script);
  await chmod(destination, 0o755);
  await writeFile(path.join(outputDirectory, 'README.txt'), `Structogram ADS ${version}\n\nРусский:\n1. Распакуйте этот ZIP полностью.\n2. Дважды нажмите Installation.command.\n   Или откройте Terminal в этой папке и выполните: bash ./Installation.command\n3. Скрипт скачает проверенную сборку под ваш Mac и запустит приложение.\n   Node.js, Homebrew и пароль администратора не нужны.\nСледующий запуск использует установленную копию без скачивания.\nДля обновления запустите установщик новой версии; старый не обновляется сам.\n\nEnglish:\nDouble-click Installation.command, or run bash ./Installation.command in this folder.\nFirst install needs internet. Subsequent launches use the installed copy in ~/Applications.\nNo developer tools, administrator password, or GitHub login are needed.\n\nPinned release: ${releaseTag}\nSource: https://github.com/${repository}\n\nThe SHA-256 values are embedded in Installation.command. They verify the downloaded package against this version; they are not a guarantee that code is harmless. The app is ad-hoc signed, not Apple-notarized. If macOS blocks first launch, review the message in Privacy & Security.\n`);
  return { destination, hashes: { arm64: replacements.ARM64_SHA256, x64: replacements.X64_SHA256 } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const releaseTag = process.env.STRUCTOGRAM_RELEASE_TAG;
  if (!releaseTag) throw new Error('Set STRUCTOGRAM_RELEASE_TAG to the exact release tag before creating the installer.');
  const result = await createInstaller({ releaseDirectory: path.join(root, 'release'), outputDirectory: path.join(root, 'release', 'Structogram Installer'), repository: process.env.GITHUB_REPOSITORY || '23sdd/StructogramProgForADS', releaseTag, version });
  console.log('Generated executable installer:', result.destination);
}
