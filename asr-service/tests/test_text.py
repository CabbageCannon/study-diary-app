import unittest

from app.main import merge_transcripts


class TranscriptMergeTests(unittest.TestCase):
    def test_removes_exact_overlap_between_audio_chunks(self) -> None:
        self.assertEqual(
            merge_transcripts(["先检索相关文档再交给RAG", "RAG生成最后的答案"]),
            "先检索相关文档再交给RAG生成最后的答案",
        )


if __name__ == "__main__":
    unittest.main()
