/**
 * @description       : Interface for AI generation services.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/12/2025
 **/
public interface IAIGenerationService {
  String generateContent(String prompt, Map<String, Object> context);
  Boolean isAvailable();
}
