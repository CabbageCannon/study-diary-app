import unittest

from app.services.speech_service import normalize_transcript


class SpeechTranscriptionTests(unittest.TestCase):
    def test_normalizes_sensevoice_tags_and_technical_term_case(self) -> None:
        text = "<|zh|><|NEUTRAL|><|Speech|>用rag配合langchain，再通过websocket返回"
        self.assertEqual(normalize_transcript(text), "用RAG配合LangChain，再通过WebSocket返回")


if __name__ == "__main__":
    unittest.main()
