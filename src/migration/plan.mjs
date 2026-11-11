export function createMigrationPreview(inspections = []) {
  const sources = inspections.map(item => ({
    sourceKind: item.sourceKind,
    sourceHash: item.sourceHash,
    byteLength: item.byteLength ?? null,
    records: item.sourceKind === 'virtual-person' ? item.memories.length
      : item.sourceKind === 'whale-galgame' ? (item.deepseekAvailable ? 1 : 0)
      : item.sourceKind === 'ppl-persona-ir' ? 1 : 0,
    warnings: [
      ...(item.unknownMemoryLines?.length ? ['UNKNOWN_MEMORY_LINES:' + item.unknownMemoryLines.length] : []),
      ...(item.mediaDataUrls?.length ? ['MEDIA_EXTRACTION_REQUIRED:' + item.mediaDataUrls.length] : []),
      ...(item.deferredCharacterIds?.length ? ['DEFERRED_CHARACTERS:' + item.deferredCharacterIds.length] : []),
      ...(item.sourceKind === 'whale-galgame' && !item.deepseekAvailable ? ['DEEPSEEK_CHARACTER_NOT_FOUND'] : []),
    ],
  }))
  return {
    schema: 'dsh-virtual-avatar.migration-preview/0.1',
    requiresExplicitConfirmation: true,
    writesPerformed: false,
    sources,
    totalRecords: sources.reduce((sum, item) => sum + item.records, 0),
  }
}
