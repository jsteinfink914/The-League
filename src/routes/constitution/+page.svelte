<script>
    import { dues } from '$lib/utils/helper';
    let one, oneOne, oneOneOne, oneTwo, oneTwoOne, oneTwoTwo, oneTwoThree, oneTwoFour, oneTwoFive, oneThree;
    let two, twoOne, twoTwo, twoThree;
    let three, threeOne;
    let four, fourOne, fourTwo;
    let five, fiveOne;
    let six, sixOne, sixTwo, sixThree;
    let seven, sevenOne, sevenTwo, sevenThree;

    const goToSection = (section) => {
        const top = section.getBoundingClientRect().top + window.pageYOffset;
        window.scrollTo({left: 0, top, behavior: 'smooth'});
    }
</script>

<main>
  <p
  >
    This browser does not support PDFs. Please download the PDF to view it: <a href="/constitution.pdf">Download PDF</a>.
  </p>
</main>

<style>
  main {
    padding: 20px;
  }

  h1 {
    margin-bottom: 20px;
  }

  object {
    width: 100%;
    height: 100vh; /* Full viewport height */
    border: none;
    overflow: auto;
  }

  @media (max-width: 600px) {
    object {
      height: 100vh; /* Adjust height for mobile */
    }
  }
</style>
