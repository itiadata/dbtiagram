import { applyEdit } from './edit';
import { distributeEditedModels, createModelStore } from './modelStore';
import { parseModelYml } from './parse';
import { mergeModelYml } from './merge';
import { rewriteSqlRefs } from './sqlRefs';

export interface RenameTextFile { path: string; before: string; after: string }
export interface ModelRenamePlan { textFiles: RenameTextFile[]; sqlRename?: { from: string; to: string } }
export interface ModelRenameInput {
  oldName: string; newName: string; targetModelFilePath: string; targetProjectRoot: string; targetPackage: string;
  modelFiles: readonly { path: string; projectRoot: string | null; text: string }[];
  sqlFiles: readonly { path: string; projectRoot: string; text: string; kind: 'model' | 'macro' | 'test' | 'snapshot' }[];
  matchingModelSqlPaths: readonly string[]; destinationExists: boolean;
  workspaceProjects: readonly { root: string; name: string }[];
}

export function planModelRename(input: ModelRenameInput): ModelRenamePlan {
  if (input.workspaceProjects.filter((project) => project.name === input.targetPackage).length > 1) throw new Error(`Cannot rename model: multiple open dbt projects are named "${input.targetPackage}"`);
  if (input.matchingModelSqlPaths.length > 1) throw new Error(`Cannot rename model "${input.oldName}": multiple model SQL files were found`);
  if (input.matchingModelSqlPaths.length === 1 && input.destinationExists) throw new Error(`Cannot rename model "${input.oldName}": ${input.newName}.sql already exists`);

  const records = input.modelFiles.map((file) => ({ uri: file.path, file: parseModelYml(file.text, file.path) }));
  const models = records.flatMap((record) => record.file.models);
  let targetModelIndex = -1; let offset = 0;
  const roots: Array<string | null> = [];
  for (let fileIndex = 0; fileIndex < records.length; fileIndex += 1) {
    const record = records[fileIndex]; const source = input.modelFiles[fileIndex];
    if (record === undefined || source === undefined) continue;
    const local = record.file.models.findIndex((model) => model.name === input.oldName);
    if (samePath(record.uri, input.targetModelFilePath) && local >= 0) targetModelIndex = offset + local;
    roots.push(...record.file.models.map(() => source.projectRoot)); offset += record.file.models.length;
  }
  if (targetModelIndex < 0) throw new Error(`No model named "${input.oldName}" exists in ${input.targetModelFilePath}`);
  const edited = applyEdit(models, { kind: 'setModelName', model: input.oldName, name: input.newName }, {
    targetProjectRoot: input.targetProjectRoot, targetPackage: input.targetPackage, targetModelIndex, modelProjectRoots: roots,
  }).models;
  const store = createModelStore(records);
  const textFiles: RenameTextFile[] = distributeEditedModels(store, edited).map((record) => {
    const before = input.modelFiles.find((file) => samePath(file.path, record.uri))?.text;
    if (before === undefined) throw new Error(`Missing model text for ${record.uri}`);
    return { path: record.uri, before, after: mergeModelYml(before, record.file) };
  });
  for (const file of input.sqlFiles) {
    const after = rewriteSqlRefs(file.text, (ref) => ref.name === input.oldName && (ref.package === undefined ? samePath(file.projectRoot, input.targetProjectRoot) : ref.package === input.targetPackage), input.newName);
    if (after !== file.text) textFiles.push({ path: file.path, before: file.text, after });
  }
  const source = input.matchingModelSqlPaths[0];
  return { textFiles: textFiles.sort((a, b) => a.path.localeCompare(b.path)), ...(source === undefined ? {} : { sqlRename: { from: source, to: sibling(source, `${input.newName}.sql`) } }) };
}

export function reverseModelRenamePlan(plan: ModelRenamePlan): ModelRenamePlan {
  return { textFiles: plan.textFiles.map((file) => ({ path: plan.sqlRename !== undefined && samePath(file.path, plan.sqlRename.from) ? plan.sqlRename.to : file.path, before: file.after, after: file.before })), ...(plan.sqlRename === undefined ? {} : { sqlRename: { from: plan.sqlRename.to, to: plan.sqlRename.from } }) };
}
function samePath(a: string, b: string): boolean { return a.replace(/\\/g, '/').toLowerCase() === b.replace(/\\/g, '/').toLowerCase(); }
function sibling(path: string, name: string): string { const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')); return `${path.slice(0, index + 1)}${name}`; }
