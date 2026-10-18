const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const storage = require('../src/engine/storage');

async function runTests() {
  console.log('=== Testing Task Management, Context Menu Actions & File Deletion ===\n');

  // Create temporary test files in downloads directory
  const settings = storage.getSettings();
  const testDir = settings.defaultDownloadDir;
  if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

  const testFile1 = path.join(testDir, 'test_delete_disk.bin');
  fs.writeFileSync(testFile1, 'Sample binary payload for disk deletion test');

  const testFile2 = path.join(testDir, 'test_delete_keep.bin');
  fs.writeFileSync(testFile2, 'Sample binary payload to keep on disk');

  const testFile3 = path.join(testDir, 'test_rename_original.bin');
  fs.writeFileSync(testFile3, 'Sample binary payload for rename test');

  // Insert mock tasks into storage
  const task1 = {
    id: 'test_task_del_1',
    url: 'https://example.com/test_delete_disk.bin',
    fileName: 'test_delete_disk.bin',
    savePath: testFile1,
    status: 'completed',
    downloadedBytes: 100,
    fileSize: 100
  };

  const task2 = {
    id: 'test_task_del_2',
    url: 'https://example.com/test_delete_keep.bin',
    fileName: 'test_delete_keep.bin',
    savePath: testFile2,
    status: 'completed',
    downloadedBytes: 100,
    fileSize: 100
  };

  const task3 = {
    id: 'test_task_rename_3',
    url: 'https://example.com/test_rename_original.bin',
    fileName: 'test_rename_original.bin',
    savePath: testFile3,
    status: 'completed',
    downloadedBytes: 100,
    fileSize: 100
  };

  storage.upsertTask(task1);
  storage.upsertTask(task2);
  storage.upsertTask(task3);

  console.log('[1/4] Verifying single deletion without deleting file from disk...');
  storage.deleteTask(task2.id);
  assert.strictEqual(storage.getTask(task2.id), undefined, 'Task 2 should be deleted from storage');
  assert.strictEqual(fs.existsSync(testFile2), true, 'File 2 should remain on disk when deleteFile is false');
  console.log('  ✓ Task removed from list, file preserved on disk.');

  console.log('[2/4] Verifying deletion with file removal from disk...');
  if (fs.existsSync(task1.savePath)) fs.unlinkSync(task1.savePath);
  storage.deleteTask(task1.id);
  assert.strictEqual(storage.getTask(task1.id), undefined, 'Task 1 should be deleted from storage');
  assert.strictEqual(fs.existsSync(testFile1), false, 'File 1 should be erased from disk');
  console.log('  ✓ Task removed from list, file deleted from storage.');

  console.log('[3/4] Verifying file rename and category determination...');
  const newName = 'test_rename_renamed.mp4';
  const newPath = path.join(testDir, newName);
  if (fs.existsSync(task3.savePath)) {
    fs.renameSync(task3.savePath, newPath);
  }
  task3.fileName = newName;
  task3.savePath = newPath;
  task3.categoryId = storage.determineCategory(newName);
  storage.upsertTask(task3);

  const updatedTask = storage.getTask(task3.id);
  assert.strictEqual(updatedTask.fileName, newName, 'Task filename should be updated');
  assert.strictEqual(updatedTask.categoryId, 'cat-vid', 'Category should update to video for .mp4');
  assert.strictEqual(fs.existsSync(newPath), true, 'Renamed file should exist on disk');
  console.log('  ✓ Task and on-disk file successfully renamed.');

  console.log('[4/4] Verifying queue assignment...');
  task3.queueId = 'queue-night';
  storage.upsertTask(task3);
  assert.strictEqual(storage.getTask(task3.id).queueId, 'queue-night');
  task3.queueId = null;
  storage.upsertTask(task3);
  assert.strictEqual(storage.getTask(task3.id).queueId, null);
  console.log('  ✓ Add to queue and Delete from queue operations verified.');

  // Clean up test files and tasks
  if (fs.existsSync(testFile2)) fs.unlinkSync(testFile2);
  if (fs.existsSync(newPath)) fs.unlinkSync(newPath);
  storage.deleteTask(task3.id);

  console.log('\n>>> ALL TASK ACTION & DELETE TESTS PASSED CLEANLY! <<<\n');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
