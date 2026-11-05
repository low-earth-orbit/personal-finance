import unittest

from analysis.shared.returns import arithmetic_to_geometric, geometric_to_arithmetic


class ReturnConversionTests(unittest.TestCase):
    def test_round_trip(self):
        geometric = 0.0687
        volatility = 0.1257
        arithmetic = geometric_to_arithmetic(geometric, volatility)
        self.assertAlmostEqual(arithmetic_to_geometric(arithmetic, volatility), geometric, places=14)

    def test_known_value(self):
        self.assertAlmostEqual(geometric_to_arithmetic(0.0687, 0.1257), 0.076, places=3)


if __name__ == "__main__":
    unittest.main()
