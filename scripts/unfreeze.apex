try {
    String targetUsername = '___TARGET_USERNAME___';
    System.debug('Attempting to unfreeze user: ' + targetUsername);

    List<User> users = [SELECT Id FROM User WHERE Username = :targetUsername LIMIT 1];
    
    if (users.isEmpty()) {
        System.debug('ERROR: User not found: ' + targetUsername);
        return;
    }

    UserLogin ul = [SELECT Id, IsFrozen FROM UserLogin WHERE UserId = :users[0].Id LIMIT 1];

    if (ul.IsFrozen) {
        ul.IsFrozen = false;
        update ul;
        System.debug('SUCCESS: User ' + targetUsername + ' has been unfrozen.');
    } else {
        System.debug('INFO: User ' + targetUsername + ' is already active.');
    }

} catch (Exception e) {
    System.debug('CRITICAL ERROR: ' + e.getMessage());
}